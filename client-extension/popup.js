/**
 * Тонкий клиент: читает страницу hdrezka, получает прямые ссылки на видео
 * и субтитры и отправляет задачи на локальный сервер загрузок.
 * Файлы скачиваются сервером (не браузером).
 */

const ext = globalThis.browser ?? globalThis.chrome;
const $ = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Настройки: адрес и токен — в storage.sync, чтобы переезжали с профилем;
 *  в storage.local остаётся та же копия (синхронизация может быть выключена). */
const STORAGE_KEY = 'idk-server-settings';
// Ключ настроек до переименования проекта: читается, только если нового нет.
const LEGACY_STORAGE_KEY = 'hdzg-server-settings';
const UI_KEY = 'idk-server-ui';
const STATUS_LABELS = {
  queued: 'в очереди',
  downloading: 'скачивается',
  paused: 'пауза',
  done: 'готово',
  error: 'ошибка',
  canceled: 'отменена',
};

/** Иконки действий в очереди (inline SVG, как на сайте). */
const ACTION_ICONS = {
  pause:
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/></svg>',
  cancel:
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  resume:
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>',
  retry:
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polyline points="21 4 21 10 15 10"/><path d="M20.5 14a8.5 8.5 0 1 1-1.9-8.4L21 8"/></svg>',
};

const state = {
  settings: { serverUrl: '', token: '' },
  tab: null,
  page: null,
  // последний ответ /api/state: нужен для проверки свободного места
  server: null,
  spaceWarn: null,
  voiceovers: [],
  resolveCache: new Map(), // ключ параметров → ответ сайта
  seasons: {},
  busy: false,
  pollTimer: null,
  lastResolve: null,
  lastError: null,
  // ручной выбор серий (режим «Выбрать серии…»)
  selectedEpisodes: new Set(), // ключи вида "сезон:серия"
  activeSeason: null,
  // проба качеств: вес файла и реальное разрешение (см. media-probe.js)
  probeInfo: {}, // «1080p» → {size, width, height, source}
  probePending: new Set(),
  probeToken: 0, // пробы прошлой озвучки становятся неактуальны
  // серии всех сезонов (ответ action=get_episodes)
  episodesLoaded: false,
  episodesLoad: null,
  // субтитры: пока пользователь не трогал галочку/язык — базовые значения
  subsTouched: false,
  // состояние интерфейса
  queueCollapsed: false,
  queueBusy: false,
  queueSignature: '',
  initBusy: false,
  initQueued: false,
};

/* ─────────────────────────── настройки и сервер ─────────────────────────── */

async function loadSettings() {
  const [stored, uiStored] = await Promise.all([
    readStoredSettings(),
    ext.storage.local.get(UI_KEY).catch(() => ({})),
  ]);
  state.settings = { ...state.settings, ...(stored || {}) };

  const ui = uiStored[UI_KEY] || {};
  state.queueCollapsed = Boolean(ui.queueCollapsed);
  applyQueueCollapsed();

  $('#server-url').value = state.settings.serverUrl || '';
  $('#server-token').value = state.settings.token || '';
  if (!state.settings.serverUrl) $('#settings').classList.remove('hidden');
  updateConnSub(false);
}

function syncArea() {
  try {
    return ext.storage.sync ?? null;
  } catch {
    return null; // очень старый браузер — остаёмся на storage.local
  }
}

/**
 * Читает настройки из sync и local и берёт более свежую копию (updatedAt).
 * Так первая версия с sync сама мигрирует старые значения из local, а две
 * копии не «перетягивают» друг друга при обычной работе.
 */
async function readStoredSettings() {
  const areas = [syncArea(), ext.storage.local].filter(Boolean);
  const copies = [];
  for (const area of areas) {
    try {
      const value = (await area.get(STORAGE_KEY))?.[STORAGE_KEY];
      if (value && typeof value === 'object') copies.push(value);
    } catch {
      // приватный режим или нет разрешения — просто пропускаем это хранилище
    }
  }
  if (copies.length === 0) {
    // Настройки, сохранённые до переименования проекта, переносятся сами:
    // как только они сохранятся под новым ключом, старый перестанет читаться.
    for (const area of areas) {
      try {
        const legacy = (await area.get(LEGACY_STORAGE_KEY))?.[LEGACY_STORAGE_KEY];
        if (legacy && typeof legacy === 'object') {
          copies.push(legacy);
          break;
        }
      } catch {
        // как выше — пропускаем это хранилище
      }
    }
  }
  copies.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  return copies[0] || null;
}

async function saveSettings() {
  const previousUrl = state.settings.serverUrl;

  state.settings = {
    serverUrl: $('#server-url').value.trim().replace(/\/+$/, ''),
    token: $('#server-token').value.trim(),
  };
  await writeStoredSettings(state.settings);
  $('#settings-status').textContent = 'Сохранено';
  setTimeout(() => ($('#settings-status').textContent = ''), 2000);
  updateConnSub(false);
  updateQueueVisibility();

  // Адрес появился или сменился — только теперь имеет смысл читать страницу.
  if (state.settings.serverUrl !== previousUrl) init();
  refreshQueue();
}

/** Пишет настройки в sync и local; ошибку синхронизации не считаем сбоем. */
async function writeStoredSettings(settings) {
  const value = { ...settings, updatedAt: Date.now() };
  const writes = [ext.storage.local.set({ [STORAGE_KEY]: value })];
  const sync = syncArea();
  if (sync) writes.push(sync.set({ [STORAGE_KEY]: value }));
  const results = await Promise.allSettled(writes);
  if (results[0].status === 'rejected') {
    // без рабочего local настройки не сохранить — это уже настоящая ошибка
    throw results[0].reason;
  }
  return value;
}

async function serverApi(path, options = {}) {
  if (!state.settings.serverUrl) throw new Error('Укажите адрес сервера в настройках (⚙)');
  const headers = { ...(options.headers || {}) };
  if (state.settings.token) headers['X-Auth-Token'] = state.settings.token;
  if (options.body) headers['Content-Type'] = 'application/json';

  // Таймаут обязателен: без него недоступный сервер подвешивает запросы (а попап
  // опрашивает состояние раз в 3 с), и интерфейс начинает тормозить.
  const timeout = options.timeout ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(state.settings.serverUrl + path, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Сервер не отвечает (таймаут)');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ──────────────────── функции, выполняемые на странице ──────────────────── */

/** Определяет тип страницы и параметры плеера (выполняется в MAIN-мире). */
async function pageDetect() {
  const pageHtml = document.documentElement.outerHTML;

  // Разбираем вызов sof.tv.initCDN*Events как настоящий JS-вызов: на разных
  // зеркалах порядок и количество аргументов отличаются, жёсткая регулярка
  // ненадёжна (из-за неё, например, не работали сериалы).
  function findCall(text) {
    const re = /sof\.tv\.(initCDNMoviesEvents|initCDNSeriesEvents)\s*\(/g;
    let match;
    while ((match = re.exec(text))) {
      let depth = 0;
      let quote = null;
      for (let i = re.lastIndex; i < text.length; i++) {
        const char = text[i];
        if (quote) {
          if (char === '\\') {
            i++;
            continue;
          }
          if (char === quote) quote = null;
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        if (char === '(') depth++;
        else if (char === ')') {
          if (depth === 0) return { initiator: match[1], args: text.slice(re.lastIndex, i) };
          depth--;
        }
      }
    }
    return null;
  }

  function splitArgs(raw) {
    const args = [];
    let current = '';
    let quote = null;
    let depth = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (quote) {
        if (char === '\\') {
          current += char + (raw[++i] ?? '');
          continue;
        }
        if (char === quote) quote = null;
        current += char;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        current += char;
        continue;
      }
      if (char === '{' || char === '[' || char === '(') depth++;
      if (char === '}' || char === ']' || char === ')') depth--;
      if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) args.push(current.trim());
    return args;
  }

  function unquote(value) {
    const text = String(value ?? '').trim();
    if (
      (text.startsWith("'") && text.endsWith("'")) ||
      (text.startsWith('"') && text.endsWith('"'))
    ) {
      return text.slice(1, -1);
    }
    return text;
  }

  const call = findCall(pageHtml);
  const args = call ? splitArgs(call.args).map(unquote) : [];
  const favs = document.getElementById('ctrl_favs')?.value || '';
  const titleEl = document.querySelector('.b-post__title h1');
  const origEl = document.querySelector('.b-post__origtitle');
  const activeTranslator = document.querySelector('.b-translator__item.active');

  let pageType = 'DEFAULT';
  let movie = null;

  if (call && args[0] && args[1]) {
    if (call.initiator === 'initCDNMoviesEvents') {
      pageType = 'FILM';
      movie = {
        action: 'get_movie',
        id: args[0],
        translator_id: args[1],
        is_camrip: args[2] ?? null,
        is_ads: args[3] ?? null,
        is_director: args[4] ?? null,
        favs,
      };
    } else {
      pageType = 'SERIAL';
      movie = {
        action: 'get_stream',
        id: args[0],
        translator_id: args[1],
        season: args[2] ?? null,
        episode: args[3] ?? null,
        favs,
      };
    }
  }

  if (movie && activeTranslator?.dataset?.translator_id) {
    movie.translator_id = activeTranslator.dataset.translator_id;
    if (movie.action === 'get_movie') {
      movie.is_camrip = activeTranslator.dataset.camrip || null;
      movie.is_ads = activeTranslator.dataset.ads || null;
      movie.is_director = activeTranslator.dataset.director || null;
    }
  }

  if (movie && movie.action === 'get_stream') {
    const seasonEl = document.querySelector(
      '.b-simple_seasons__list .b-simple_season__item.active',
    );
    const episodeEl = document.querySelector(
      '.b-simple_episodes__list .b-simple_episode__item.active',
    );
    if (seasonEl?.dataset?.tab_id) movie.season = seasonEl.dataset.tab_id;
    if (episodeEl?.dataset?.episode_id) movie.episode = episodeEl.dataset.episode_id;
  }

  let quality = null;
  try {
    quality = window.CDNPlayer?.api ? window.CDNPlayer.api('quality') : null;
  } catch {
    quality = null;
  }

  // Год: строка «Дата выхода»/«Год» в таблице, иначе год из адреса страницы.
  let year = null;
  for (const row of document.querySelectorAll('.b-post__info tr')) {
    const label = row.cells?.[0]?.textContent?.trim() ?? '';
    if (/^(Дата выхода|Год|Год выхода)/i.test(label)) {
      const years = (row.cells?.[1]?.textContent ?? '').match(/(?:19|20)\d{2}/g);
      if (years && years.length) {
        year = years[0];
        break;
      }
    }
  }
  if (!year) year = /(?:19|20)\d{2}/.exec(location.pathname)?.[0] ?? null;

  // Озвучки собираем здесь же: раньше это был второй прогон по странице с повторным
  // разбором всего HTML, а на тяжёлых страницах это заметно тормозит попап.
  const translators = [];
  for (const item of document.querySelectorAll('.b-translator__item')) {
    const id = item.getAttribute('data-translator_id');
    translators.push({
      id,
      title:
        (item.getAttribute('title') || '').trim() ||
        (id === '110' ? 'Оригинал' : id === '0' ? 'Озвучка №1' : `Озвучка ${id}`),
      flag: item.querySelector('img')?.src.split('/').at(-1)?.split('.')[0] || null,
      prem: item.classList.contains('b-prem_translator'),
      is_camrip: item.getAttribute('data-camrip'),
      is_ads: item.getAttribute('data-ads'),
      is_director: item.getAttribute('data-director'),
    });
  }

  if (translators.length === 0 && call && args[0] && args[1]) {
    // Озвучек в разметке нет — берём ту, что в вызове плеера.
    const id = args[1];
    let title = id === '110' ? 'Оригинал' : id === '0' ? 'Озвучка №1' : `Озвучка ${id}`;

    for (const row of document.querySelectorAll('.b-post__info tr')) {
      if (row.cells?.[0]?.textContent?.trim() === 'В переводе:') {
        title = row.cells[1]?.textContent?.trim() || title;
        break;
      }
    }

    const isMovie = call.initiator === 'initCDNMoviesEvents';
    translators.push({
      id,
      title,
      flag: null,
      prem: false,
      is_camrip: isMovie ? (args[2] ?? null) : null,
      is_ads: isMovie ? (args[3] ?? null) : null,
      is_director: isMovie ? (args[4] ?? null) : null,
    });
  }

  return {
    pageType,
    movie,
    quality,
    year,
    translators,
    hasCall: Boolean(call),
    callArgs: args.slice(0, 6),
    url: location.href.split('#')[0],
    category: location.pathname.split('/').filter(Boolean)[0] ?? null,
    title: titleEl ? titleEl.textContent.trim() : document.title,
    origTitle: origEl ? origEl.textContent.trim() : null,
  };
}

/** Сезоны и серии прямо со страницы (фолбэк, если ответ сайта их не содержит). */
async function pageSeasons() {
  const seasons = {};
  const container = document.getElementById('simple-episodes-tabs');
  if (!container) return seasons;

  for (const item of container.querySelectorAll('li')) {
    const tabId = item.dataset.tab_id;
    const seasonId = item.dataset.season_id;
    const episodeId = item.dataset.episode_id;
    const title = (item.textContent || '').trim();

    if (tabId && item.classList.contains('b-simple_season__item')) {
      seasons[tabId] = seasons[tabId] ?? { title: title || `Сезон ${tabId}`, episodes: [] };
      if (title) seasons[tabId].title = title;
    }

    if (seasonId && episodeId) {
      if (!seasons[seasonId]) seasons[seasonId] = { title: `Сезон ${seasonId}`, episodes: [] };
      if (!seasons[seasonId].episodes.some((episode) => episode.id === episodeId)) {
        seasons[seasonId].episodes.push({
          id: episodeId,
          title: title || `Серия ${episodeId}`,
        });
      }
    }
  }

  return seasons;
}

/**
 * Запрос к /ajax/get_cdn_series/ из контекста самой страницы.
 * Так используются куки и сессия браузера, Cloudflare не мешает.
 */
async function pageResolve(request) {
  const body = new URLSearchParams();
  body.set('id', request.id);
  body.set('translator_id', request.translator_id);
  body.set('favs', request.favs || '');

  if (request.action === 'get_stream') {
    body.set('season', request.season);
    body.set('episode', request.episode);
    body.set('action', 'get_stream');
  } else if (request.action === 'get_episodes') {
    body.set('action', 'get_episodes');
  } else {
    body.set('is_camrip', request.is_camrip ?? '');
    body.set('is_ads', request.is_ads ?? '');
    body.set('is_director', request.is_director ?? '');
    body.set('action', 'get_movie');
  }

  const url = new URL('/ajax/get_cdn_series/', location.origin);
  url.searchParams.set('t', String(Date.now()));

  const response = await fetch(url.toString(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  });

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!data) {
    return { success: false, message: `Ответ не JSON (HTTP ${response.status}): ${text.slice(0, 150)}` };
  }
  return data;
}

async function runInPage(func, args = []) {
  const results = await ext.scripting.executeScript({
    target: { tabId: state.tab.id },
    world: 'MAIN',
    func,
    args,
  });
  const first = results?.[0];
  if (!first) throw new Error('Пустой ответ от страницы');
  if (first.error) throw new Error(String(first.error.message || first.error));
  return first.result;
}

/**
 * Сбор ссылок по сериям — цикл живёт на самой вкладке (MAIN world), поэтому
 * попап можно закрыть: работа продолжится, а при следующем открытии попап
 * подхватит результат (см. resumeCollectJob). Прогресс и ответы сайта лежат
 * в window.__idkJob, туда же попап пишет отмену.
 *
 * Функция уходит в executeScript целиком и потому ни на что снаружи не
 * ссылается: запрос к сайту здесь свой (такой же, как в pageResolve).
 * Ожидаемая партия (window.__idkJob) создаётся попапом до запуска — по её id
 * проверяем, что собираем именно её.
 */
async function pageCollectLinks(job) {
  const progress = window.__idkJob;
  if (!progress || progress.id !== job.id) return; // попап уже начал другую партию

  const key = (episode) => (episode ? `${episode.season}:${episode.episode}` : 'film');

  const request = async (episode) => {
    const body = new URLSearchParams();
    body.set('id', job.movie.id);
    body.set('translator_id', job.movie.translator_id);
    body.set('favs', job.movie.favs || '');
    if (episode) {
      body.set('season', episode.season);
      body.set('episode', episode.episode);
      body.set('action', 'get_stream');
    } else {
      body.set('is_camrip', job.movie.is_camrip ?? '');
      body.set('is_ads', job.movie.is_ads ?? '');
      body.set('is_director', job.movie.is_director ?? '');
      body.set('action', 'get_movie');
    }

    const url = new URL('/ajax/get_cdn_series/', location.origin);
    url.searchParams.set('t', String(Date.now()));
    const response = await fetch(url.toString(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    });

    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!data) throw new Error(`Ответ не JSON (HTTP ${response.status}): ${text.slice(0, 120)}`);
    if (data.success === false) throw new Error(data.message || 'Сайт вернул ошибку');
    return data;
  };

  for (const episode of job.episodes) {
    if (window.__idkJob !== progress) return; // партию сменили
    if (progress.canceled) {
      progress.status = 'canceled';
      break;
    }

    try {
      const data = await request(episode);
      progress.results[key(episode)] = {
        ok: true,
        url: data.url ?? null,
        subtitle: data.subtitle ?? null,
        subtitle_lns: data.subtitle_lns ?? null,
        message: null,
      };
    } catch (error) {
      progress.results[key(episode)] = {
        ok: false,
        message: String(error?.message || error),
      };
    }

    progress.done++;
    // Пауза между сериями: не долбим сайт пачкой.
    if (job.episodes.length > 1) await new Promise((resolve) => setTimeout(resolve, 350));
  }

  if (progress.status === 'running') progress.status = 'done';
  progress.finishedAt = Date.now();
}

/* ──────────────────────────── парсеры ответа сайта ──────────────────────── */

function clearTrash(data) {
  const trash = [
    '//_//QEBAQEAhIyMhXl5e',
    '//_//Xl5eIUAjIyEhIyM=',
    '//_//JCQhIUAkJEBeIUAjJCRA',
    '//_//IyMjI14hISMjIUBA',
    '//_//JCQjISFAIyFAIyM=',
  ];
  let result = data;
  while (trash.some((part) => result.includes(part))) {
    result = result.replace(new RegExp(trash.join('|'), 'g'), '');
  }
  return atob(result.replace('#h', ''));
}

function parseQualityLabel(raw) {
  const prem = raw.match(/>\s?(\d+[pk](?:\s+Ultra)?)\s?</i);
  return prem ? prem[1] : raw;
}

// Вес и высота качества, выбор качества по умолчанию и озвучки — в defaults.js
// (HdzgDefaults): это чистые функции над подписями, их проверяют тесты.

function decodeVideoURL(stream) {
  if (!stream) return {};
  let cleaned;
  try {
    cleaned = clearTrash(stream);
  } catch {
    cleaned = stream;
  }

  const result = {};
  for (const item of String(cleaned).split(',')) {
    const match = item.match(/\[(.*?)]/);
    if (!match) continue;
    const label = parseQualityLabel(match[1]);
    const urls = item
      .slice(match[0].length)
      .split(/\sor\s/)
      .map((url) => url.trim())
      .filter(Boolean);
    if (!urls.length) continue;
    result[label] = { urls, isPrem: label !== match[1] };
  }
  return result;
}

// Как и в media-probe.js: ссылка с параметрами (…mp4?token=…) — тоже mp4,
// иначе проба показала бы вес качества, которое потом нечем скачать.
function isMp4Url(url) {
  return /^https?:\/\/.*\.mp4(\?|$)/i.test(url);
}

function isM3u8Url(url) {
  return /^https?:\/\/.*\.m3u8(\?|$)/i.test(url);
}

function decodeSubtitles(data) {
  if (!data?.subtitle) return [];
  return String(data.subtitle)
    .split(',')
    .map((chunk) => {
      const match = chunk.match(/\[(.*?)]\s*(https?:\/\/\S+?\.(?:vtt|srt))/i);
      if (!match) return null;
      const lang = match[1];
      return { lang, url: match[2], code: data.subtitle_lns?.[lang] ?? null };
    })
    .filter(Boolean);
}

function parseSeasons(html) {
  const seasons = {};
  if (!html) return seasons;
  for (const line of String(html).split('</li>')) {
    if (!line.trim()) continue;
    const match = line.match(/data-tab_id="(\d+)">(.*)$/);
    if (!match) continue;
    seasons[match[1]] = { title: match[2].trim(), episodes: [] };
  }
  return seasons;
}

function parseEpisodes(data, seasons) {
  if (!data?.episodes) return seasons;
  for (const block of String(data.episodes).split('</ul>')) {
    if (!block.trim()) continue;
    for (const line of block.split('</li>')) {
      if (!line.trim()) continue;
      const match = line.match(/data-season_id="(\d+)" data-episode_id="(\d+)">(.*)$/);
      if (!match) continue;
      const seasonId = match[1];
      if (!seasons[seasonId]) seasons[seasonId] = { title: `Сезон ${seasonId}`, episodes: [] };
      seasons[seasonId].episodes.push({ id: match[2], title: match[3].trim() });
    }
  }
  return seasons;
}

/* ─────────────────────── выбор серий (чипы) ─────────────────────── */

const epKey = (season, episode) => `${season}:${episode}`;

function seasonKeys() {
  return Object.keys(state.seasons).sort((a, b) => parseInt(a) - parseInt(b));
}

function selectedEpisodeList() {
  return Array.from(state.selectedEpisodes)
    .map((key) => {
      const [season, episode] = key.split(':');
      return { season, episode };
    })
    .sort((a, b) => parseInt(a.season) - parseInt(b.season) || parseInt(a.episode) - parseInt(b.episode));
}

/* ─────────────────────────────── интерфейс ─────────────────────────────── */

function setPageInfo(html, isError = false) {
  const el = $('#page-info');
  el.innerHTML = html;
  el.classList.toggle('error', isError);
}

function setStatus(text) {
  const el = $('#action-status');
  el.textContent = text || '';
  const value = String(text || '');
  el.classList.toggle('bad', /^(Ошибка|Не удалось|Нет связи)/.test(value));
  el.classList.toggle('good', /^Отправлено/.test(value));
}

function showControls(visible) {
  $('#controls').classList.toggle('hidden', !visible);
}

function renderVoiceovers() {
  const select = $('#voiceover');
  select.innerHTML = '';
  for (const voice of state.voiceovers) {
    const option = document.createElement('option');
    option.value = String(voice.id);
    option.textContent = voice.title + (voice.prem ? ' ★' : '');
    select.appendChild(option);
  }
  const page = state.page;
  if (page?.movie) select.value = String(page.movie.translator_id);
  select.disabled = state.voiceovers.length <= 1;
}

function voiceoverTitle(id) {
  const voice = state.voiceovers.find((item) => String(item.id) === String(id));
  return voice?.title ?? String(id);
}

/**
 * Ставит озвучке страницы выбранный id. Для фильмов переставляет ещё и флаги
 * camrip/ads/director: у каждой озвучки они свои, и запрос без них вернул бы
 * файл чужого перевода.
 */
function applyVoiceover(id) {
  const movie = state.page?.movie;
  const selected = state.voiceovers.find((voice) => String(voice.id) === String(id));
  if (!movie || !selected) return false;

  movie.translator_id = String(selected.id);
  if (movie.action === 'get_movie') {
    movie.is_camrip = selected.is_camrip || null;
    movie.is_ads = selected.is_ads || null;
    movie.is_director = selected.is_director || null;
  }
  return true;
}

/** У озвучки нет ссылок вовсе (так бывает, если она озвучила не все серии). */
function hasNoLinks(data) {
  return Object.keys(decodeVideoURL(data?.url)).length === 0;
}

/* ─────────────────────── выбор качества (свой список) ───────────────────────
   Нативный <select> не умеет показывать бейдж и вес внутри строки, поэтому
   список рисуем сами. <select id="quality"> остаётся скрытым источником
   значения — по нему собираются задачи. */

/** Кодеки для подсказки: что внутри, кроме разрешения. */
const CODEC_LABELS = {
  avc1: 'H.264',
  avc3: 'H.264',
  hvc1: 'HEVC',
  hev1: 'HEVC',
  av01: 'AV1',
  vp09: 'VP9',
  mp4v: 'MPEG-4',
};

/**
 * Насколько реальное разрешение расходится с подписью. Подписи на hdrezka
 * врут в обе стороны: «1080p» вполне может быть 720p, а «1080p Ultra» —
 * честными 1080p, причём это разные файлы.
 */
function resolutionVerdict(key, probe) {
  const claimed = HdzgDefaults.claimedHeight(key);
  if (!claimed || !probe?.height) return 'same';
  if (probe.height < claimed * 0.95) return 'lower';
  if (probe.height > claimed * 1.05) return 'higher';
  return 'same';
}

/** Реальное разрешение для «подкоробки»: null — если совпало с подписью или неизвестно. */
function realResolutionLabel(key, probe) {
  if (!probe?.height) return null;
  // Подпись без числа («SD»): сравнивать не с чем, но реальное разрешение полезно.
  if (HdzgDefaults.claimedHeight(key) === null) return `${probe.height}p`;
  // Как в оригинальном расширении: совпало — подкоробка не нужна.
  return resolutionVerdict(key, probe) === 'same' ? null : `${probe.height}p`;
}

/** Подсказка строки: что именно лежит в файле (доступна у любого качества). */
function qualityTooltip(key, probe) {
  if (!probe) {
    // Такие качества не пробуем (см. HdzgDefaults.shouldProbe) — говорим прямо,
    // иначе пустая строка выглядит как «вес ещё не пришёл».
    return HdzgDefaults.shouldProbe(key) ? '' : 'Вес и разрешение не пробуем: качество ниже 720p';
  }
  const parts = [];
  if (probe.width && probe.height) parts.push(`В файле ${probe.width}×${probe.height}`);
  if (CODEC_LABELS[probe.codec]) parts.push(CODEC_LABELS[probe.codec]);
  if (probe.size) parts.push(formatBytes(probe.size));
  if (probe.source === 'hls') parts.push('вес примерный (HLS)');

  const verdict = resolutionVerdict(key, probe);
  if (verdict === 'lower') parts.push('меньше заявленного');
  else if (verdict === 'higher') parts.push('больше заявленного');

  return parts.join(' · ');
}

/** Строка качества: имя, звёздочка премиума, подкоробка с реальным разрешением, вес. */
function qualityRowHtml(key, quality) {
  const probe = state.probeInfo[key];
  const pending = state.probePending.has(key);
  const real = pending ? null : realResolutionLabel(key, probe);
  const size = probe?.size ? formatBytes(probe.size) : pending ? '…' : '';
  const verdict = real ? resolutionVerdict(key, probe) : 'same';

  return (
    `<span class="q-name">${escapeHtml(key)}</span>` +
    (quality?.isPrem ? '<span class="q-star" title="премиум">★</span>' : '') +
    (real ? `<span class="q-real ${verdict}">${escapeHtml(real)}</span>` : '') +
    (size ? `<span class="q-size${pending ? ' pending' : ''}">${escapeHtml(size)}</span>` : '')
  );
}

/** Обновляет строку целиком: разметка + подсказка с полным разрешением. */
function updateQualityRow(row, key, quality) {
  row.innerHTML = qualityRowHtml(key, quality);
  row.title = qualityTooltip(key, state.probeInfo[key]);
}

/**
 * Список качеств и запуск пробы. Проба асинхронная: строки сначала появляются
 * без веса, а по мере ответов обновляются (см. probeQualities).
 */
function renderQualities() {
  const select = $('#quality');
  const list = $('#quality-list');
  const qualities = state.resolved?.qualities ?? {};
  const keys = HdzgDefaults.sortQualities(Object.keys(qualities));
  // Вес и разрешение ищем не у всех: качества ниже 720p — мусор (см. defaults.js).
  const probed = keys.filter((key) => HdzgDefaults.shouldProbe(key));

  // Пробы относятся к конкретным ссылкам: при смене озвучки старые не годятся.
  state.probeToken++;
  state.probeInfo = {};
  state.probePending = new Set();

  select.innerHTML = '';
  list.innerHTML = '';

  for (const key of keys) {
    const option = document.createElement('option');
    option.value = key;
    select.appendChild(option);

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'q-opt';
    row.dataset.value = key;
    row.setAttribute('role', 'option');
    updateQualityRow(row, key, qualities[key]);
    list.appendChild(row);
  }

  // Качество по умолчанию — не то, что стоит в плеере: «1080p Ultra», иначе
  // «1080p» (см. HdzgDefaults.pickDefaultQuality).
  select.value = HdzgDefaults.pickDefaultQuality(qualities) ?? keys[0] ?? '';

  const empty = keys.length === 0;
  select.disabled = empty;
  $('#quality-btn').disabled = empty;
  closeQualityList();
  syncQualityButton();
  markSelectedQualityRow();
  probeQualities(qualities, probed);
}

function syncQualityButton() {
  const key = $('#quality').value;
  const button = $('#quality-btn');
  const quality = state.resolved?.qualities?.[key];

  if (!key) {
    $('#quality-text').innerHTML = '<span class="q-name">— нет доступных качеств —</span>';
    button.title = '';
    return;
  }

  $('#quality-text').innerHTML = qualityRowHtml(key, quality);
  button.title = qualityTooltip(key, state.probeInfo[key]);
}

function markSelectedQualityRow() {
  const key = $('#quality').value;
  for (const row of $('#quality-list').querySelectorAll('.q-opt')) {
    const on = row.dataset.value === key;
    row.classList.toggle('on', on);
    row.setAttribute('aria-selected', on ? 'true' : 'false');
  }
}

/** Перерисовка строк после ответа пробы (строки не пересоздаём — теряется фокус). */
function refreshQualityLabels() {
  const qualities = state.resolved?.qualities ?? {};
  for (const row of $('#quality-list').querySelectorAll('.q-opt')) {
    updateQualityRow(row, row.dataset.value, qualities[row.dataset.value]);
  }
  syncQualityButton();
}

/**
 * Проба качеств: вес и реальное разрешение. keys — только те, что стоит
 * пробовать (720p и выше, см. HdzgDefaults.shouldProbe): каждая проба — это
 * Range-запрос к CDN, и на 360p/144p его тратить незачем. Все пробы идут
 * параллельно (как в оригинальном расширении) — ссылки, которые повторяются
 * у нескольких качеств, модуль склеивает в один запрос сам (см. media-probe.js).
 */
async function probeQualities(qualities, keys) {
  const pageUrl = state.page?.url;
  if (!pageUrl || !keys.length) return;

  const token = state.probeToken;
  state.probePending = new Set(keys);
  refreshQualityLabels();

  await Promise.all(
    keys.map(async (key) => {
      let info = null;
      try {
        info = await HdzgProbe.probeQuality(qualities[key]?.urls ?? [], { pageUrl });
      } catch {
        info = null; // без веса качество всё равно можно выбрать
      }

      if (token !== state.probeToken) return;
      state.probeInfo[key] = info;
      state.probePending.delete(key);
      refreshQualityLabels();
    }),
  );

  if (token !== state.probeToken) return;
  state.probePending.clear();
  refreshQualityLabels();
  renderSpaceWarn(); // вес выбранного качества мог появиться только сейчас
}

/* панель списка: position: fixed, координаты считаем сами (иначе обрежется
   краем попапа — он низкий, а список из пяти качеств вниз не влезает) */

function isQualityListOpen() {
  return !$('#quality-list').classList.contains('hidden');
}

function positionQualityList() {
  const list = $('#quality-list');
  const rect = $('#quality-btn').getBoundingClientRect();
  const gap = 5;
  const margin = 6;
  const width = Math.max(rect.width, 236);

  list.style.width = `${width}px`;
  const height = Math.min(list.scrollHeight, window.innerHeight - margin * 2);

  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - margin) {
    const above = rect.top - gap - height;
    top = above >= margin ? above : Math.max(margin, window.innerHeight - margin - height);
  }

  const left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - margin - width);
  list.style.top = `${Math.round(top)}px`;
  list.style.left = `${Math.round(left)}px`;
  list.style.maxHeight = `${Math.round(height)}px`;
}

function openQualityList() {
  const list = $('#quality-list');
  if (!list.querySelector('.q-opt')) return;
  list.classList.remove('hidden');
  $('#quality-btn').setAttribute('aria-expanded', 'true');
  positionQualityList();
  markSelectedQualityRow();
  (list.querySelector('.q-opt.on') ?? list.querySelector('.q-opt'))?.focus();
}

function closeQualityList() {
  $('#quality-list').classList.add('hidden');
  $('#quality-btn').setAttribute('aria-expanded', 'false');
}

function toggleQualityList() {
  if (isQualityListOpen()) closeQualityList();
  else openQualityList();
}

function selectQuality(key) {
  $('#quality').value = key;
  syncQualityButton();
  markSelectedQualityRow();
  renderSpaceWarn(); // у качеств разный вес — пересчитываем оценку места
}

function renderSubtitles() {
  const langs = state.resolved?.subtitles ?? [];
  const select = $('#subs-lang');
  const wrap = $('#subs-lang-wrap');
  const previous = select.value;

  select.innerHTML = '';
  for (const item of langs) {
    const option = document.createElement('option');
    option.value = item.lang;
    option.textContent = item.lang;
    select.appendChild(option);
  }

  // Язык: русский по умолчанию, но выбор пользователя не перебиваем, пока он
  // есть у этой озвучки (у разных озвучек набор субтитров свой).
  const keepPrevious = state.subsTouched && langs.some((item) => item.lang === previous);
  const russian = HdzgDefaults.pickSubtitleLang(langs);
  select.value = keepPrevious ? previous : (russian ?? langs[0]?.lang ?? '');

  // У этой озвучки субтитров нет — про них и не говорим: ряд скрыт целиком,
  // галочка снята, чтобы задача на субтитры не ушла случайно.
  const hasSubs = langs.length > 0;
  $('#subs-row').classList.toggle('hidden', !hasSubs);
  if (!hasSubs) {
    $('#subs-enabled').checked = false;
  } else if (!state.subsTouched) {
    // Базовое значение: качаем субтитры и берём русские (см. defaults.js).
    // Русских нет — галочку не ставим: украинские к русской озвучке не нужны.
    $('#subs-enabled').checked = russian !== null;
  }
  wrap.classList.toggle('hidden', !hasSubs || !$('#subs-enabled').checked);
}

function renderSeasons() {
  const page = state.page;
  const keys = seasonKeys();
  const isSerial = page?.pageType === 'SERIAL';

  $('#range-block').classList.toggle('hidden', !isSerial);
  if (!isSerial) return;

  if (keys.length) {
    // Активный сезон для сетки: текущий со страницы, иначе первый доступный.
    const currentSeason = String(page.movie.season ?? keys[0]);
    if (!state.activeSeason || !keys.includes(String(state.activeSeason))) {
      state.activeSeason = keys.includes(currentSeason) ? currentSeason : keys[0];
    }

    // Стартовый выбор — текущая серия, чтобы сразу было видно, что отмечено.
    if (state.selectedEpisodes.size === 0 && page.movie.season && page.movie.episode) {
      state.selectedEpisodes.add(epKey(page.movie.season, page.movie.episode));
    }
  }

  renderEpisodeGrid();
  updateRangeNote();
  prefetchAllEpisodes();
}

/** Русское склонение: 1 серия, 2 серии, 5 серий. */
function plural(count, forms) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Сколько серий уйдёт при текущем выборе «Что качать». */
function updateRangeNote() {
  const el = $('#range-note');
  const page = state.page;
  if (!page || page.pageType !== 'SERIAL') {
    el.textContent = '';
    return;
  }

  const mode = $('#range-mode').value;
  const countEpisodes = (seasonKey) => (state.seasons[seasonKey]?.episodes ?? []).length;
  const episodesWord = (count) => plural(count, ['серия', 'серии', 'серий']);

  if (mode === 'current') {
    el.textContent = page.movie.episode
      ? `К отправке: серия ${page.movie.episode}`
      : 'Не удалось определить текущую серию — выберите другой вариант';
    return;
  }
  if (mode === 'custom') {
    el.textContent = ''; // в сетке серий свой счётчик
    return;
  }

  if (mode === 'season') {
    const count = countEpisodes(String(page.movie.season));
    el.textContent = count
      ? `К отправке: ${count} ${episodesWord(count)} (сезон ${page.movie.season})`
      : 'Серии подтянутся при отправке';
    return;
  }

  const keys = seasonKeys();
  const total = keys.reduce((sum, key) => sum + countEpisodes(key), 0);
  const seasons = keys.filter((key) => countEpisodes(key)).length;

  if (!total) {
    el.textContent = 'Серии подтянутся при отправке';
    return;
  }
  // Пока сайт не отдал остальные сезоны, счётчик честно об этом говорит.
  el.textContent =
    `К отправке: ${total} ${episodesWord(total)} ` +
    `(${seasons} ${plural(seasons, ['сезон', 'сезона', 'сезонов'])})` +
    (state.episodesLoaded ? '' : ' — список ещё уточняется');
}

/** Сезоны-табы и сетка чипов для режима «Выбрать серии…». */
function renderEpisodeGrid() {
  const keys = seasonKeys();

  const tabs = $('#season-tabs');
  tabs.innerHTML = '';
  for (const key of keys) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `season-tab${String(key) === String(state.activeSeason) ? ' on' : ''}`;
    button.dataset.season = key;
    button.textContent = state.seasons[key].title || `Сезон ${key}`;
    tabs.appendChild(button);
  }

  const grid = $('#ep-grid');
  grid.innerHTML = '';

  const episodes = state.seasons[state.activeSeason]?.episodes ?? [];
  if (!episodes.length) {
    grid.innerHTML = '<div class="hint">Серии не найдены. Откройте страницу сериала и обновите её (F5).</div>';
  }

  for (const episode of episodes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ep-chip${state.selectedEpisodes.has(epKey(state.activeSeason, episode.id)) ? ' on' : ''}`;
    button.dataset.episode = episode.id;
    button.title = episode.title || `Серия ${episode.id}`;
    button.textContent = episode.id;
    grid.appendChild(button);
  }

  updateEpisodeSummary();
}

function updateEpisodeSummary() {
  const count = state.selectedEpisodes.size;
  const el = $('#ep-summary');
  el.textContent = count
    ? `Выбрано: ${count} ${plural(count, ['серия', 'серии', 'серий'])}`
    : 'Ничего не выбрано';
  el.classList.toggle('bad', count === 0);
}

function updateQueueVisibility() {
  $('#queue').classList.toggle('hidden', !state.settings.serverUrl);
}

/** Свёрнутая очередь: сам список скрыт, шапка со статистикой остаётся. */
function applyQueueCollapsed() {
  $('#queue').classList.toggle('collapsed', state.queueCollapsed);
  $('#queue-toggle').setAttribute('aria-expanded', String(!state.queueCollapsed));
}

function queueButtons(task) {
  const buttons = [];
  if (task.status === 'downloading' || task.status === 'queued') {
    buttons.push(['pause', ACTION_ICONS.pause, 'Пауза']);
    buttons.push(['cancel', ACTION_ICONS.cancel, 'Отменить']);
  } else if (task.status === 'paused') {
    buttons.push(['resume', ACTION_ICONS.resume, 'Продолжить']);
    buttons.push(['cancel', ACTION_ICONS.cancel, 'Отменить']);
  } else if (task.status === 'error' || task.status === 'canceled') {
    buttons.push(['retry', ACTION_ICONS.retry, 'Повторить']);
  }

  if (buttons.length === 0) return '';

  return `<span class="q-actions">${buttons
    .map(
      ([action, icon, title]) =>
        `<button type="button" class="q-btn ${action === 'cancel' ? 'act-danger' : 'act-accent'}" data-id="${task.id}" data-action="${action}" title="${title}">${icon}</button>`,
    )
    .join('')}</span>`;
}

/** Страница, откуда отправлена задача (расширение кладёт её в referer).
 *  По ней берут свежую ссылку, когда старая протухла: сервер сам не может —
 *  у него нет сессии сайта, а вкладку пользователь закрывает. */
function taskSourceUrl(task) {
  const referer = String(task.referer || '').trim();
  if (!/^https?:\/\//i.test(referer)) return null;
  try {
    if (new URL(referer).host === new URL(task.url).host) return null; // это сам CDN
  } catch {
    return null;
  }
  return referer;
}

/** Подписанные ссылки hdrezka живут часами: 403/404 у задачи — обычно именно это. */
function looksExpired(task) {
  return !!taskSourceUrl(task) && /\b4\d\d\b/.test(String(task.error || ''));
}

function renderQueue(stateData) {
  const stats = stateData?.stats;
  $('#queue-stats').textContent = stats
    ? `скачивается ${stats.downloading} · очередь ${stats.queued} · готово ${stats.done}` +
      (stats.paused ? ` · пауза ${stats.paused}` : '') +
      (stats.error ? ` · ошибок ${stats.error}` : '')
    : '';

  const list = $('#queue-list');
  const tasks = (stateData?.tasks ?? []).slice(0, 8);
  if (!tasks.length) {
    list.innerHTML = '<div class="hint">Задач пока нет.</div>';
    return;
  }

  list.innerHTML = tasks
    .map((task) => {
      const percent =
        task.totalBytes > 0 ? Math.min(100, (task.receivedBytes / task.totalBytes) * 100) : 0;
      const cls = `status-${task.status}`;
      const bytes =
        task.totalBytes > 0
          ? `${formatBytes(task.receivedBytes)} / ${formatBytes(task.totalBytes)}`
          : task.receivedBytes > 0
            ? formatBytes(task.receivedBytes)
            : '';
      // Имя задачи — ссылка на страницу-источник: удобно переотправить
      // задачу, когда её ссылка протухла.
      const src = taskSourceUrl(task);
      const name = escapeHtml(task.filename || task.url);
      const nameHtml = src
        ? `<a class="q-name q-name-link" href="${escapeHtml(src)}" target="_blank" rel="noreferrer" title="Открыть страницу-источник: ${escapeHtml(src)}">${name}</a>`
        : `<div class="q-name">${name}</div>`;
      const hint = looksExpired(task)
        ? `<div class="q-hint">Ссылка, похоже, протухла (${escapeHtml(task.error || '')}) — откройте страницу-источник и отправьте задачу заново.</div>`
        : '';
      return `
        <div class="queue-item">
          ${nameHtml}
          <div class="q-bar"><div style="width:${percent.toFixed(1)}%"></div></div>
          <div class="q-row">
            <span class="${cls}">${STATUS_LABELS[task.status] || task.status}</span>
            <span>${bytes}</span>
            ${queueButtons(task)}
          </div>
          ${hint}
        </div>`;
    })
    .join('');
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[i]}`;
}

/** Строка состояния сервера под попапом (свободное место, папка, слоты). */
function renderServerWidget(data) {
  const server = data?.server;
  const dot = $('#sw-dot');

  if (!server) {
    dot?.classList.add('bad');
    $('#sw-free').textContent = 'нет данных';
    $('#sw-free').classList.remove('bad');
    $('#sw-folder').textContent = '—';
    $('#sw-meta').textContent = '';
    return;
  }

  dot?.classList.remove('bad');
  const free = server.freeSpace;
  const need = Number(server.needBytes) || 0;
  const freeEl = $('#sw-free');
  let freeText = free ? `свободно ${formatBytes(free)}` : 'место: —';
  if (need > 0) freeText += ` · нужно ≈${formatBytes(need)}`;
  freeEl.textContent = freeText;
  // Красным — когда очередь уже не влезает (сервер считает по реальной папке).
  freeEl.classList.toggle('bad', server.spaceEnough === false);
  freeEl.title = need > 0 ? needHintText(server) : '';

  $('#sw-folder').textContent = server.saveDir || server.downloadDir || '—';
  const slots = data?.settings?.max_concurrent ?? '—';
  $('#sw-meta').textContent = `${server.ffmpeg ? 'ffmpeg' : 'без ffmpeg'} · слотов ${server.active ?? 0}/${slots}`;
}

function needHintText(server) {
  const placeholder = formatBytes(Number(server.placeholderBytes) || 0);
  return (
    `«Нужно ≈${formatBytes(Number(server.needBytes) || 0)}» — сколько места ещё понадобится очереди: ` +
    'незаконченные задачи минус уже скачанное. У задач без известного веса берётся среднее по скачанному, ' +
    `а если истории нет — ${placeholder}.`
  );
}

/* ─────────── проверка свободного места под партию (перед отправкой) ───────────
   Вес качества уже известен из пробы (он же показан в списке качеств), серии —
   из выбранного диапазона, «нужно серверу» приходит в /api/state. Если сумма
   больше свободного места, кнопка не отправляет с первого клика: показываем
   предупреждение и просим подтвердить. */

let spaceArmed = false;
let spaceArmTimer = null;

/** Сколько серий уйдёт в партию — та же логика, что в buildEpisodeList, но без запросов. */
function plannedEpisodeCount() {
  const page = state.page;
  if (!page || page.pageType !== 'SERIAL') return 1;

  const mode = $('#range-mode').value;
  if (mode === 'current') return 1;
  if (mode === 'custom') return state.selectedEpisodes.size || 1;
  if (mode === 'season') {
    return (state.seasons[String(page.movie.season)]?.episodes ?? []).length || 1;
  }
  const total = seasonKeys().reduce(
    (sum, key) => sum + (state.seasons[key]?.episodes ?? []).length,
    0,
  );
  return total || 1;
}

/** Оценка «не влезет» или null, если считать нечего / места хватает. */
function spaceCheck(subsOnly = false) {
  const server = state.server;
  if (subsOnly || !server || server.freeSpace == null) return null;

  const size = Number(state.probeInfo[$('#quality').value]?.size) || 0;
  if (!size) return null; // вес не определился — считать нечего

  const count = plannedEpisodeCount();
  const need = (Number(server.needBytes) || 0) + size * count;
  if (need <= server.freeSpace) return null;
  return { need, free: server.freeSpace, count };
}

function renderSpaceWarn() {
  const box = $('#space-warn');
  if (!box) return;

  const warn = spaceCheck();
  state.spaceWarn = warn;
  if (!warn) {
    box.classList.add('hidden');
    box.textContent = '';
    return;
  }

  const approx = warn.count > 1 ? ` (вес качества × ${warn.count} серий — оценка)` : '';
  box.textContent = spaceArmed
    ? `Всё равно скачать? Места может не хватить: нужно ≈${formatBytes(warn.need)}, свободно ${formatBytes(warn.free)}.`
    : `На сервере может не хватить места: нужно ≈${formatBytes(warn.need)}, свободно ${formatBytes(warn.free)}${approx}.`;
  box.classList.remove('hidden');
}

function armSpace() {
  spaceArmed = true;
  clearTimeout(spaceArmTimer);
  spaceArmTimer = setTimeout(disarmSpace, 6000);
  updateDownloadButtons();
  renderSpaceWarn();
}

function disarmSpace() {
  if (!spaceArmed) return;
  spaceArmed = false;
  clearTimeout(spaceArmTimer);
  updateDownloadButtons();
  renderSpaceWarn();
}

/** Подпись под названием: связь с сервером. */
function updateConnSub(online) {
  const el = $('#conn-sub');
  if (!el) return;

  if (!state.settings.serverUrl) {
    el.textContent = 'адрес сервера не указан — откройте ⚙';
    el.classList.add('bad');
    return;
  }

  el.textContent = online ? `сервер на связи · ${state.settings.serverUrl.replace(/^https?:\/\//, '')}` : 'нет связи с сервером';
  el.classList.toggle('bad', !online);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* ─────────────────────────────── основная логика ────────────────────────── */

async function getActiveTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Не удалось определить активную вкладку');
  if (!/^https?:\/\//i.test(tab.url || '')) {
    throw new Error('Откройте страницу фильма на hdrezka (и её зеркалах) и повторите');
  }
  state.tab = tab;
}

function movieKey(movie, episode) {
  return [
    movie.id,
    movie.translator_id,
    episode ? `s${episode.season}e${episode.episode}` : 'film',
  ].join('|');
}

async function resolveFor(episode) {
  const movie = state.page.movie;
  if (episode && (!episode.season || !episode.episode)) {
    throw new Error(
      'Не удалось определить сезон и серию на странице. Обновите страницу (F5) и попробуйте снова.',
    );
  }

  const key = movieKey(movie, episode);
  if (state.resolveCache.has(key)) return state.resolveCache.get(key);

  const request = episode
    ? {
        action: 'get_stream',
        id: movie.id,
        translator_id: movie.translator_id,
        favs: movie.favs,
        season: episode.season,
        episode: episode.episode,
      }
    : {
        action: 'get_movie',
        id: movie.id,
        translator_id: movie.translator_id,
        favs: movie.favs,
        is_camrip: movie.is_camrip,
        is_ads: movie.is_ads,
        is_director: movie.is_director,
      };

  let data;
  try {
    data = await runInPage(pageResolve, [request]);
  } catch (error) {
    state.lastError = String(error?.message || error);
    throw error;
  }

  state.lastResolve = {
    request,
    success: data?.success ?? null,
    message: data?.message ?? null,
    url: typeof data?.url === 'string' ? data.url.slice(0, 300) : (data?.url ?? null),
    subtitle: typeof data?.subtitle === 'string' ? data.subtitle.slice(0, 200) : (data?.subtitle ?? null),
    seasonsLength: typeof data?.seasons === 'string' ? data.seasons.length : null,
    episodesLength: typeof data?.episodes === 'string' ? data.episodes.length : null,
  };

  if (!data || data.success === false) {
    const message = data?.message || data?.error || 'Сайт вернул ошибку';
    state.lastError = message;
    throw new Error(message);
  }
  state.resolveCache.set(key, data);
  return data;
}

async function applyResolvedData(data) {
  const qualities = decodeVideoURL(data.url);
  const subtitles = decodeSubtitles(data);
  let seasons = parseEpisodes(data, parseSeasons(data.seasons));
  if (Object.keys(seasons).length === 0) {
    // Ответ без серий — пробуем прочитать список прямо со страницы.
    try {
      seasons = (await runInPage(pageSeasons)) || {};
    } catch {
      seasons = {};
    }
  }
  // Сезоны только что перечитаны: список серий всех сезонов нужен заново.
  state.episodesLoaded = false;
  return { qualities, subtitles, seasons };
}

async function init() {
  if (state.initBusy) {
    state.initQueued = true;
    return;
  }
  state.initBusy = true;

  try {
    await loadSettings();
    updateQueueVisibility();

    // Пока адрес сервера не указан — страницу не читаем. Раньше детект страницы,
    // запрос ссылок и разбор HTML стартовали сразу при открытии попапа и на тяжёлых
    // страницах подтормаживали интерфейс (в том числе когда человек вводил адрес
    // в настройках). Сохранили адрес — init() вызывается заново (см. saveSettings).
    if (!state.settings.serverUrl) {
      state.page = null;
      setPageInfo(
        `<span class="name">Сначала укажите адрес сервера</span>` +
          `<span class="meta">Откройте настройки (шестерёнка), вставьте адрес вида http://192.168.1.100:8080 и нажмите «Сохранить».</span>`,
      );
      showControls(false);
      return;
    }

    try {
      await getActiveTab();
      const page = await runInPage(pageDetect);

      if (!page?.movie) {
        state.page = page;
        const snippet = page?.title ? `<span class="meta">${escapeHtml(page.title)}</span>` : '';
        setPageInfo(
          `<span class="name">Это не страница фильма или сериала</span>${snippet}` +
            `<span class="meta">Откройте страницу фильма/сериала и нажмите иконку расширения снова.` +
            ` Если страница правильная — скопируйте диагностику (значок в шапке) и пришлите её.</span>`,
          true,
        );
        showControls(false);
        return;
      }

      state.page = page;
      // Озвучки приходят вместе с детектом страницы — второй прогон по DOM не нужен.
      state.voiceovers = page.translators || [];

      // По умолчанию — дубляж, если он есть: hdrezka нередко ставит активной свою
      // озвучку, и раньше её приходилось менять руками (см. HdzgDefaults.pickVoiceover).
      const siteVoiceover = page.movie.translator_id;
      const pickedVoiceover = HdzgDefaults.pickVoiceover(state.voiceovers, siteVoiceover);
      const dubApplied =
        String(pickedVoiceover) !== String(siteVoiceover) && applyVoiceover(pickedVoiceover);
      renderVoiceovers();

      const kind = page.pageType === 'SERIAL' ? 'Сериал' : 'Фильм';
      setPageInfo(
        `<span class="name">${escapeHtml(page.title)}</span>` +
          `<span class="meta">${kind}${page.origTitle ? ` · ${escapeHtml(page.origTitle)}` : ''}` +
          `${page.quality ? ` · плеер: ${escapeHtml(page.quality)}` : ''}</span>`,
      );

      setStatus('Получаем ссылки…');
      const episode =
        page.pageType === 'SERIAL'
          ? { season: page.movie.season, episode: page.movie.episode }
          : null;
      let data = await resolveFor(episode);
      let voiceoverNote = '';

      // У дубляжа может не оказаться этой серии (сериал озвучен не весь) — тогда
      // возвращаемся на озвучку сайта и говорим об этом, а не показываем пустоту.
      if (dubApplied && hasNoLinks(data) && applyVoiceover(siteVoiceover)) {
        renderVoiceovers();
        voiceoverNote =
          `У «${voiceoverTitle(pickedVoiceover)}» нет этой серии — вернулись на «${voiceoverTitle(siteVoiceover)}»`;
        data = await resolveFor(episode);
      }

      const { qualities, subtitles, seasons } = await applyResolvedData(data);

      state.resolved = { qualities, subtitles };
      state.seasons = seasons;

      renderQualities();
      renderSubtitles();
      renderSeasons();
      showControls(true);
      setStatus(voiceoverNote);
      checkAlreadyDownloaded();
      // Партия могла собираться (или собраться), пока попап был закрыт.
      resumeCollectJob();
    } catch (error) {
      state.lastError = String(error?.message || error);
      setPageInfo(
        `<span class="name">Ошибка</span><span class="meta">${escapeHtml(error.message)}</span>` +
          `<span class="meta">Если это страница фильма или сериала — скопируйте диагностику (значок в шапке) и пришлите её.</span>`,
        true,
      );
      showControls(false);
    }
  } finally {
    state.initBusy = false;
    if (state.initQueued) {
      state.initQueued = false;
      init();
    }
  }
}

/* ───────────────── серии всех сезонов (режим «Весь сериал») ─────────────────
   Ответ по текущей серии содержит серии только текущего сезона, остальные
   сайт отдаёт запросом action=get_episodes (без номера сезона — сразу все). */

async function resolveAllEpisodes() {
  const movie = state.page.movie;
  const cacheKey = `episodes|${movie.id}|${movie.translator_id}`;
  if (state.resolveCache.has(cacheKey)) return state.resolveCache.get(cacheKey);

  const request = {
    action: 'get_episodes',
    id: movie.id,
    translator_id: movie.translator_id,
    favs: movie.favs,
  };

  let data;
  try {
    data = await runInPage(pageResolve, [request]);
  } catch (error) {
    state.lastError = String(error?.message || error);
    throw error;
  }

  if (!data || data.success === false) {
    const message = data?.message || 'Сайт не вернул список серий';
    state.lastError = message;
    throw new Error(message);
  }

  state.resolveCache.set(cacheKey, data);
  return data;
}

/** Раскладывает ответ get_episodes по сезонам, не затирая уже известные серии. */
function mergeEpisodes(data) {
  const parsed = parseEpisodes(data, {});
  let added = 0;

  for (const [seasonId, season] of Object.entries(parsed)) {
    const target = state.seasons[seasonId];
    if (!target) {
      if (season.episodes.length) {
        state.seasons[seasonId] = { title: season.title, episodes: season.episodes };
        added += season.episodes.length;
      }
    } else if (!target.episodes.length) {
      target.episodes = season.episodes;
      added += season.episodes.length;
    }
  }

  // Сайт иногда отдаёт разметку без data-season_id — тогда это серии текущего сезона.
  if (!added && state.page?.movie?.season) {
    const current = state.seasons[String(state.page.movie.season)];
    if (current && !current.episodes.length) {
      const loose = [];
      for (const chunk of String(data?.episodes ?? '').split('</li>')) {
        const match = chunk.match(/data-episode_id="(\d+)">(.*)$/);
        if (match) loose.push({ id: match[1], title: match[2].trim() });
      }
      current.episodes = loose;
      added += loose.length;
    }
  }

  return added;
}

/** Есть ли сезоны, для которых сайт ещё не отдал список серий. */
function seasonsWithoutEpisodes() {
  return seasonKeys().filter((key) => !(state.seasons[key]?.episodes ?? []).length);
}

/** Догрузка списка серий — один раз на озвучку (промис общий, чтобы не дублировать). */
function ensureAllEpisodes() {
  if (!seasonsWithoutEpisodes().length) return Promise.resolve(false);

  const seasonsRef = state.seasons;
  if (!state.episodesLoad) {
    state.episodesLoad = resolveAllEpisodes()
      .then((data) => {
        // За время запроса могли сменить озвучку — тогда результат уже чужой.
        if (seasonsRef !== state.seasons) return false;
        mergeEpisodes(data);
        return true;
      })
      .finally(() => {
        state.episodesLoad = null;
      });
  }
  return state.episodesLoad;
}

/** Фоновая догрузка: нужна счётчику серий и ручному выбору по всем сезонам. */
async function prefetchAllEpisodes() {
  if (state.page?.pageType !== 'SERIAL') return;
  if (!seasonsWithoutEpisodes().length) {
    // Все сезоны пришли вместе с ответом — счётчику осталось только обновиться.
    state.episodesLoaded = true;
    updateRangeNote();
    return;
  }

  try {
    await ensureAllEpisodes();
    state.episodesLoaded = true;
    renderEpisodeGrid();
  } catch {
    // не получилось — счётчик скажет, что список уточняется; попробуем при отправке
  }
  updateRangeNote();
}

async function buildEpisodeList() {
  const page = state.page;
  if (page.pageType !== 'SERIAL') return [null];

  const mode = $('#range-mode').value;
  const seasons = state.seasons;

  if (mode === 'current') {
    return [{ season: page.movie.season, episode: page.movie.episode }];
  }

  // Без полного списка серий «весь сериал» превратился бы в один сезон.
  if (mode === 'season' || mode === 'all') {
    try {
      setStatus('Получаем список серий…');
      await ensureAllEpisodes();
    } catch (error) {
      setStatus(`Не удалось получить все серии: ${error.message}`);
    }
  }

  if (mode === 'season') {
    const seasonKey = String(page.movie.season ?? '');
    return (seasons[seasonKey]?.episodes ?? []).map((episode) => ({
      season: seasonKey,
      episode: episode.id,
    }));
  }

  if (mode === 'all') {
    const result = [];
    for (const seasonKey of seasonKeys()) {
      for (const episode of seasons[seasonKey]?.episodes ?? []) {
        result.push({ season: seasonKey, episode: episode.id });
      }
    }
    // Сезонов в разметке не оказалось — лучше текущая серия, чем ничего.
    return result.length
      ? result
      : [{ season: page.movie.season, episode: page.movie.episode }];
  }

  // «Выбрать серии…» — то, что отмечено чипами (удобно для пропусков).
  return selectedEpisodeList();
}

function buildTasksForEpisode(data, episode, subsOnly = false) {
  const page = state.page;
  const tasks = [];
  const warnings = [];

  // Качество нужно только для видео: в режиме «только субтитры» его не запрашиваем.
  let qualityLabel = null;
  let chosen = [];

  if (!subsOnly) {
    const qualities = decodeVideoURL(data.url);
    const wanted = $('#quality').value;
    qualityLabel = HdzgDefaults.pickQuality(qualities, wanted);

    if (!qualityLabel) {
      warnings.push(episode ? `серия ${episode.episode}: нет доступного качества` : 'нет доступного качества');
      return { tasks, warnings };
    }

    const quality = qualities[qualityLabel];
    const mp4 = quality.urls.filter(isMp4Url);
    const hls = quality.urls.filter(isM3u8Url);
    chosen = mp4.length ? mp4 : hls;
    if (!chosen.length) {
      warnings.push(episode ? `серия ${episode.episode}: нет ссылок` : 'нет ссылок');
      return { tasks, warnings };
    }
  }

  // Названия сезона/серии берём из свежего ответа сайта (они зависят от озвучки),
  // с откатом на ранее разобранный список.
  const freshSeasons = episode ? parseEpisodes(data, parseSeasons(data.seasons)) : {};
  const seasonData = episode
    ? (freshSeasons[episode.season] ?? state.seasons[episode.season] ?? null)
    : null;
  const episodeData = seasonData?.episodes.find((item) => item.id === episode?.episode) ?? null;

  const base = {
    referer: page.url,
    movie_id: page.movie.id,
    title: page.title,
    orig_title: page.origTitle,
    voiceover: voiceoverTitle(page.movie.translator_id),
    year: page.year ?? null,
    category: page.category ?? null,
    group_key: `movie-${page.movie.id}`,
  };

  if (!subsOnly) {
    // Данные пробы (см. probeQualities): сервер по ним покажет, что скачалось.
    const probe = state.probeInfo[qualityLabel] ?? null;

    tasks.push({
      ...base,
      quality: qualityLabel,
      url: chosen[0],
      alt_urls: chosen.slice(1),
      season: episode?.season ?? null,
      season_title: seasonData?.title ?? null,
      episode: episode?.episode ?? null,
      episode_title: episodeData?.title ?? null,
      file_type: 'video',
      // total_bytes сервер уже умеет: это ожидаемый размер для прогресса.
      total_bytes: probe?.size ?? 0,
      // Реальное разрешение: сервер пока его только принимает (см. TODO.md).
      real_width: probe?.width ?? null,
      real_height: probe?.height ?? null,
    });
  }

  if (subsOnly || $('#subs-enabled').checked) {
    const lang = $('#subs-lang').value;
    const subtitles = decodeSubtitles(data);
    const subtitle = subtitles.find((item) => item.lang === lang);
    if (subtitle) {
      tasks.push({
        ...base,
        quality: null,
        url: subtitle.url,
        alt_urls: [],
        season: episode?.season ?? null,
        season_title: seasonData?.title ?? null,
        episode: episode?.episode ?? null,
        episode_title: episodeData?.title ?? null,
        file_type: 'subtitle',
        subtitle_lang: subtitle.lang,
        // Код языка от сайта (subtitle_lns) — сервер подставит его в имя файла,
        // если он есть; иначе сам переведёт название («Русский» → rus).
        subtitle_lang_code: subtitle.code,
      });
    } else {
      const where = episode ? `серия ${episode.episode}: ` : '';
      warnings.push(
        subtitles.length
          ? `${where}субтитры «${lang}» не найдены`
          : `${where}субтитры не найдены для этой озвучки`,
      );
    }
  }

  return { tasks, warnings };
}

/* ──────────── сбор ссылок: партия живёт на вкладке, попап наблюдает ────────────
   Зачем так: 200 серий собираются десятки секунд, и раньше попап приходилось
   держать открытым. Теперь цикл запускается на вкладке (pageCollectLinks),
   а попап только смотрит за прогрессом и отправляет готовое на сервер. */

const JOB_POLL_MS = 700;

let jobWatch = null; // текущее наблюдение, чтобы не запускать второе
let jobRunning = false;

/** Краткая сводка о партии. Ссылки не тянем: их бывает сотни (см. readJobResults). */
async function readJob() {
  if (!state.tab?.id) return null;
  try {
    const results = await ext.scripting.executeScript({
      target: { tabId: state.tab.id },
      world: 'MAIN',
      func: () => {
        const job = globalThis.__idkJob;
        if (!job) return null;
        return {
          id: job.id,
          movieId: job.movieId,
          translatorId: job.translatorId,
          title: job.title,
          quality: job.quality ?? null,
          subsOnly: Boolean(job.subsOnly),
          status: job.status,
          done: job.done,
          total: job.total,
          sent: job.sent ?? 0,
          failed: Object.values(job.results).filter((item) => !item.ok).length,
        };
      },
    });
    return results?.[0]?.result ?? null;
  } catch {
    return null; // вкладка закрыта или страница успела перезагрузиться
  }
}

async function readJobResults() {
  if (!state.tab?.id) return null;
  try {
    const results = await ext.scripting.executeScript({
      target: { tabId: state.tab.id },
      world: 'MAIN',
      func: () => {
        const job = globalThis.__idkJob;
        return job ? { id: job.id, results: job.results } : null;
      },
    });
    return results?.[0]?.result ?? null;
  } catch {
    return null;
  }
}

/** Правка партии из попапа: отмена сбора и отметка «отправлено». */
async function updateJob(patch) {
  if (!state.tab?.id) return;
  try {
    await ext.scripting.executeScript({
      target: { tabId: state.tab.id },
      world: 'MAIN',
      func: (fields) => {
        if (globalThis.__idkJob) Object.assign(globalThis.__idkJob, fields);
      },
      args: [patch],
    });
  } catch {
    // вкладка уже закрыта — править нечего
  }
}

function updateDownloadButtons() {
  const busy = state.busy || jobRunning;
  $('#download').disabled = busy;
  $('#download-subs').disabled = busy;
  // Подтверждение «всё равно скачать» (см. spaceCheck): меняем подпись кнопки.
  $('#download').classList.toggle('btn-warn', spaceArmed);
  const label = $('#download-label');
  if (label) label.textContent = spaceArmed ? 'Всё равно скачать' : 'Скачать на сервер';
}

function renderCollect(job, note = '') {
  const box = $('#collect');
  if (!job && !note) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  $('#collect-cancel').classList.toggle('hidden', job?.status !== 'running');
  $('#collect-text').textContent =
    job && !note
      ? `Собираем ссылки: ${job.done} из ${job.total}. Попап можно закрыть — сбор продолжится на вкладке.`
      : note;
}

function watchCollectJob() {
  if (!jobWatch) {
    jobWatch = runCollectWatch().finally(() => {
      jobWatch = null;
    });
  }
  return jobWatch;
}

async function runCollectWatch() {
  try {
    for (;;) {
      const job = await readJob();
      jobRunning = job?.status === 'running';
      updateDownloadButtons();

      if (!job) {
        renderCollect(null);
        return;
      }
      if (jobRunning) {
        renderCollect(job);
        await sleep(JOB_POLL_MS);
        continue;
      }

      renderCollect(null);
      await finishCollectJob(job, true);
      return;
    }
  } finally {
    jobRunning = false;
    updateDownloadButtons();
  }
}

/** Сбор закончился (или его отменили): решаем, отправлять ли партию на сервер.
 *  watched — сообщение пришло при живом наблюдении; при повторном открытии попапа
 *  про отмену молчим: партия уже история. */
async function finishCollectJob(job, watched = false) {
  if (job.status === 'sent') {
    setStatus(`Уже отправлено задач: ${job.sent}`);
    return;
  }
  if (job.status === 'canceled') {
    if (watched) setStatus(`Сбор ссылок отменён: собрано ${job.done} из ${job.total}`);
    return;
  }

  const page = state.page;
  const samePage =
    page?.movie &&
    String(page.movie.id) === String(job.movieId) &&
    String(page.movie.translator_id) === String(job.translatorId);

  if (!samePage) {
    // Собрано на другой странице/озвучке: качество и субтитры в попапе сейчас
    // другие, поэтому собирать задачи отсюда нельзя.
    renderCollect(
      null,
      `В фоне собраны ссылки для «${job.title}» (${job.done} из ${job.total}).` +
        ' Откройте ту же озвучку на странице фильма и нажмите «Скачать» заново.',
    );
    return;
  }

  await sendCollectedJob(job);
}

/** Собирает задачи из того, что накопила вкладка, и отправляет их на сервер. */
async function sendCollectedJob(job) {
  const collected = await readJobResults();
  if (!collected || collected.id !== job.id) return; // партия успела смениться

  const tasks = [];
  const warnings = [];

  for (const [key, result] of Object.entries(collected.results)) {
    const episode =
      key === 'film' ? null : { season: key.split(':')[0], episode: key.split(':')[1] };

    if (!result.ok) {
      warnings.push(episode ? `серия ${episode.episode}: ${result.message}` : result.message);
      continue;
    }

    // Тот же сборщик задач, что и раньше: качество и субтитры берутся из
    // текущего состояния попапа, а ссылки — из собранного на вкладке.
    const built = buildTasksForEpisode(
      { url: result.url, subtitle: result.subtitle, subtitle_lns: result.subtitle_lns },
      episode,
      job.subsOnly,
    );
    tasks.push(...built.tasks);
    warnings.push(...built.warnings);
  }

  if (!tasks.length) {
    setStatus(`Нечего отправлять. ${warnings.join('; ')}`);
    return;
  }

  setStatus(`Отправляем ${tasks.length} задач(и) на сервер…`);
  const response = await serverApi('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ tasks }),
    timeout: 20000, // длинные сериалы отправляются дольше обычного запроса
  });
  await updateJob({ status: 'sent', sent: response.created }); // повторно не отправим

  const warn = warnings.length ? ` Пропуски: ${warnings.slice(0, 3).join('; ')}` : '';
  // Сервер считает место уже с новыми задачами: если их вес не влезает,
  // говорим об этом сразу (оценка клиента была приблизительной).
  const space = response.space;
  const spaceNote =
    space && space.enough === false && space.freeBytes != null
      ? ` Места может не хватить: нужно ≈${formatBytes(space.needBytes)}, свободно ${formatBytes(space.freeBytes)}.`
      : '';
  setStatus(
    (job.subsOnly
      ? `Отправлено субтитров: ${response.created}.`
      : `Отправлено: ${response.created}.`) + spaceNote + warn,
  );
  refreshQueue();
  // Задачи только что созданы — обновляем сводку по фильму, чтобы рядом сразу
  // появилась кнопка «Отменить этот фильм» (см. renderMovieSummary).
  checkAlreadyDownloaded();
}

/** Подхватывает партию, которая собиралась (или собралась), пока попап был закрыт. */
async function resumeCollectJob() {
  const job = await readJob();
  if (!job) return;

  // Возвращаем выбранное качество: иначе отправка ушла бы на качестве плеера.
  // Для отменённых и отправленных партий выбор не трогаем — они уже история.
  const active = job.status === 'running' || job.status === 'done';
  if (active && job.quality && state.resolved?.qualities?.[job.quality]) {
    selectQuality(job.quality);
  }

  if (job.status === 'running') {
    jobRunning = true;
    updateDownloadButtons();
    renderCollect(job);
    watchCollectJob();
    return;
  }
  await finishCollectJob(job);
}

async function handleDownload(subsOnly = false) {
  if (state.busy || jobRunning) return;

  // Партия может не влезть на диск сервера — это выяснилось бы посреди
  // загрузки. Предупреждаем заранее и просим нажать ещё раз (кнопка меняется
  // на «Всё равно скачать»); для субтитров места всегда хватает.
  if (!subsOnly && !spaceArmed && spaceCheck()) {
    armSpace();
    return;
  }
  disarmSpace();

  state.busy = true;
  updateDownloadButtons();

  try {
    const episodes = await buildEpisodeList();
    if (!episodes.length) {
      setStatus(subsOnly ? 'Не выбрано ни одной серии для субтитров' : 'Не выбрано ни одной серии');
      return;
    }

    const page = state.page;
    const job = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      movieId: page.movie.id,
      translatorId: page.movie.translator_id,
      title: page.title,
      quality: $('#quality').value,
      subsOnly,
      movie: {
        id: page.movie.id,
        translator_id: page.movie.translator_id,
        favs: page.movie.favs,
        is_camrip: page.movie.is_camrip,
        is_ads: page.movie.is_ads,
        is_director: page.movie.is_director,
      },
      episodes,
    };

    // «Заготовку» партии ставим сами (быстро и с подтверждением), а сам цикл
    // запускаем следом и не ждём: он живёт на вкладке, а не в попапе.
    await ext.scripting.executeScript({
      target: { tabId: state.tab.id },
      world: 'MAIN',
      func: (initial) => {
        globalThis.__idkJob = initial;
      },
      args: [
        {
          id: job.id,
          movieId: job.movieId,
          translatorId: job.translatorId,
          title: job.title,
          quality: job.quality,
          subsOnly: job.subsOnly,
          status: 'running',
          done: 0,
          total: episodes.length,
          results: {},
          sent: 0,
          startedAt: Date.now(),
          finishedAt: null,
        },
      ],
    });

    ext.scripting
      .executeScript({
        target: { tabId: state.tab.id },
        world: 'MAIN',
        func: pageCollectLinks,
        args: [job],
      })
      .catch(() => {
        // Ошибки сбора видны по статусу партии (сколько серий получилось)
      });

    setStatus('');
    renderCollect({ status: 'running', done: 0, total: episodes.length });
    await watchCollectJob();
  } catch (error) {
    state.lastError = String(error?.message || error);
    setStatus(`Ошибка: ${error.message}`);
  } finally {
    state.busy = false;
    updateDownloadButtons();
  }
}

/** Сколько задач фильма ещё можно отменить (готовые и сбойные — уже история). */
function cancelableCount(summary) {
  return (summary?.downloading ?? 0) + (summary?.queued ?? 0) + (summary?.paused ?? 0);
}

/** Предупреждение «уже скачивалось» и кнопка отмены этого фильма — по сводке. */
function renderMovieSummary(summary) {
  const box = $('#already');
  const button = $('#cancel-movie');
  state.movieSummary = summary ?? null;
  disarmCancelMovie();

  if (!summary?.total) {
    box.classList.add('hidden');
    $('#already-text').textContent = '';
    button.classList.add('hidden');
    return;
  }

  const parts = [];
  if (summary.done) parts.push(`${summary.done} готово`);
  if (summary.downloading) parts.push(`${summary.downloading} качается`);
  if (summary.queued) parts.push(`${summary.queued} в очереди`);
  if (summary.paused) parts.push(`${summary.paused} на паузе`);
  if (summary.error) parts.push(`${summary.error} с ошибкой`);

  $('#already-text').textContent =
    `Уже скачивалось: ${parts.join(', ')}. ` +
    (summary.filesOnDisk ? `Файлов на диске: ${summary.filesOnDisk}. ` : '') +
    'Повторная загрузка скачает заново и перезапишет готовые файлы, если они на месте.';
  // Кнопка нужна, только когда есть что отменять.
  button.classList.toggle('hidden', cancelableCount(summary) === 0);
  box.classList.remove('hidden');
}

async function checkAlreadyDownloaded() {
  const box = $('#already');
  const movie = state.page?.movie;
  if (!movie || !state.settings.serverUrl) {
    box.classList.add('hidden');
    return;
  }

  try {
    renderMovieSummary(await serverApi(`/api/movies/${encodeURIComponent(movie.id)}`));
  } catch {
    box.classList.add('hidden');
  }
}

async function refreshQueue() {
  if (!state.settings.serverUrl) {
    updateConnSub(false);
    return;
  }
  if (state.queueBusy) return; // не наслаиваем запросы друг на друга
  state.queueBusy = true;

  try {
    const data = await serverApi('/api/state?limit=20');
    state.server = data.server ?? null;
    renderServerWidget(data);
    renderSpaceWarn();
    updateConnSub(true);

    // Перерисовываем список только когда данные изменились: иначе каждые 3 секунды
    // DOM перерисовывался впустую (и сбивалось выделение текста при вводе).
    const signature = JSON.stringify([
      data.stats ?? null,
      (data.tasks ?? []).map((task) => [task.id, task.status, task.receivedBytes]),
    ]);
    if (signature !== state.queueSignature) {
      state.queueSignature = signature;
      renderQueue(data);
    }
  } catch (error) {
    const message = escapeHtml(error.message);
    if (state.queueSignature !== `err:${message}`) {
      state.queueSignature = `err:${message}`;
      $('#queue-stats').textContent = 'нет связи';
      $('#queue-list').innerHTML = `<div class="hint">${message}</div>`;
    }
    renderServerWidget(null);
    state.server = null;
    renderSpaceWarn();
    updateConnSub(false);
  } finally {
    state.queueBusy = false;
  }
}

/* ──────────────────────────────── события ──────────────────────────────── */

$('#toggle-settings').addEventListener('click', () => {
  $('#settings').classList.toggle('hidden');
});

$('#copy-debug').addEventListener('click', async () => {
  const payload = {
    version: ext.runtime.getManifest().version,
    time: new Date().toISOString(),
    tabUrl: state.tab?.url ?? null,
    serverUrl: state.settings.serverUrl || null,
    page: state.page,
    voiceovers: state.voiceovers,
    // Пробы качеств: вес и реальное разрешение (видно, что именно определилось)
    probes: state.probeInfo,
    // Место на сервере и оценка партии: по ним видно, почему показано предупреждение
    server: state.server
      ? {
          saveDir: state.server.saveDir ?? state.server.downloadDir ?? null,
          freeSpace: state.server.freeSpace ?? null,
          needBytes: state.server.needBytes ?? null,
          spaceEnough: state.server.spaceEnough ?? null,
        }
      : null,
    spaceWarn: state.spaceWarn,
    // Фоновая партия: сколько серий собрано и чем закончилось
    job: await readJob(),
    lastResolve: state.lastResolve,
    lastError: state.lastError,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setStatus('Диагностика скопирована в буфер обмена');
  } catch (error) {
    setStatus(`Не удалось скопировать: ${error.message}`);
  }
});

$('#save-settings').addEventListener('click', saveSettings);

/* выбор качества: свой список (в <option> бейдж и вес не вставить) */
$('#quality-btn').addEventListener('click', () => toggleQualityList());

$('#quality-btn').addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault(); // иначе страница просто прокрутится
  openQualityList();
});

$('#quality-list').addEventListener('click', (event) => {
  const row = event.target.closest('.q-opt');
  if (!row) return;
  selectQuality(row.dataset.value);
  closeQualityList();
  $('#quality-btn').focus();
});

document.addEventListener('pointerdown', (event) => {
  if (!isQualityListOpen()) return;
  if (event.target.closest('#quality-sel') || event.target.closest('#quality-list')) return;
  closeQualityList();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isQualityListOpen()) {
    closeQualityList();
    $('#quality-btn').focus();
    return;
  }
  if (!isQualityListOpen()) return;
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

  const rows = [...$('#quality-list').querySelectorAll('.q-opt')];
  const index = rows.indexOf(document.activeElement);
  const next = event.key === 'ArrowDown'
    ? Math.min(rows.length - 1, index + 1)
    : Math.max(0, index - 1);
  if (rows[next]) {
    rows[next].focus();
    event.preventDefault();
  }
});

// Список позиционируется вручную: при прокрутке попапа он должен ехать за полем.
window.addEventListener('scroll', (event) => {
  if (!isQualityListOpen()) return;
  const list = $('#quality-list');
  if (event.target === list || list.contains(event.target)) return; // прокрутка самого списка
  positionQualityList();
}, true);

window.addEventListener('resize', () => {
  if (isQualityListOpen()) positionQualityList();
});

$('#voiceover').addEventListener('change', async () => {
  const movie = state.page?.movie;
  if (!movie) return;

  // Ссылки в фоновой партии собраны под прошлую озвучку — она больше не нужна.
  const running = await readJob();
  if (running?.status === 'running') await updateJob({ canceled: true });

  applyVoiceover($('#voiceover').value);

  state.resolveCache.clear();
  setStatus('Обновляем данные для выбранной озвучки…');
  try {
    const episode =
      state.page.pageType === 'SERIAL'
        ? { season: movie.season, episode: movie.episode }
        : null;
    const data = await resolveFor(episode);
    const { qualities, subtitles, seasons } = await applyResolvedData(data);
    state.resolved = { qualities, subtitles };
    state.seasons = seasons;
    renderQualities();
    renderSubtitles();
    renderSeasons();
    setStatus('');
  } catch (error) {
    setStatus(`Ошибка: ${error.message}`);
  }
});

$('#subs-enabled').addEventListener('change', () => {
  state.subsTouched = true; // выбор пользователя: дальше его не перебиваем
  const hasSubs = (state.resolved?.subtitles ?? []).length > 0;
  $('#subs-lang-wrap').classList.toggle('hidden', !$('#subs-enabled').checked || !hasSubs);
});

$('#subs-lang').addEventListener('change', () => {
  state.subsTouched = true;
});

$('#range-mode').addEventListener('change', () => {
  const mode = $('#range-mode').value;
  const custom = mode === 'custom';
  $('#range-custom').classList.toggle('hidden', !custom);
  if (custom) renderEpisodeGrid(); // значения могли устареть после смены озвучки

  updateRangeNote();
  renderSpaceWarn(); // число серий изменилось — оценка места тоже
  // «Весь сериал» по умолчанию: список серий нужен сразу, а не в момент отправки.
  if (mode === 'all' || mode === 'season') prefetchAllEpisodes();
});

/* ручной выбор серий: сезоны-табы, чипы, «выбрать все» / «снять» */
$('#season-tabs').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-season]');
  if (!button) return;
  state.activeSeason = button.dataset.season;

  // Серии этого сезона могли ещё не приехать: сайт отдаёт их отдельным запросом.
  if (!(state.seasons[state.activeSeason]?.episodes ?? []).length) {
    $('#ep-grid').innerHTML = '<div class="hint">Загружаем список серий…</div>';
    try {
      await ensureAllEpisodes();
    } catch {
      // renderEpisodeGrid ниже сам скажет, что серии не найдены
    }
  }

  renderEpisodeGrid();
  updateRangeNote();
});

$('#ep-grid').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-episode]');
  if (!button) return;
  const key = epKey(state.activeSeason, button.dataset.episode);
  if (state.selectedEpisodes.has(key)) state.selectedEpisodes.delete(key);
  else state.selectedEpisodes.add(key);
  renderEpisodeGrid();
});

$('#ep-all').addEventListener('click', () => {
  for (const episode of state.seasons[state.activeSeason]?.episodes ?? []) {
    state.selectedEpisodes.add(epKey(state.activeSeason, episode.id));
  }
  renderEpisodeGrid();
});

$('#ep-none').addEventListener('click', () => {
  state.selectedEpisodes.clear();
  renderEpisodeGrid();
});

$('#download').addEventListener('click', () => handleDownload(false));
$('#download-subs').addEventListener('click', () => handleDownload(true));

/* остановка фонового сбора ссылок */
$('#collect-cancel').addEventListener('click', async () => {
  setStatus('Останавливаем сбор ссылок…');
  await updateJob({ canceled: true });
});

/* Отмена задач текущего фильма — из блока «уже скачивалось», чтобы не искать
   его строки в очереди. Подтверждение вторым кликом, как у «Остановить все». */

let cancelMovieArmed = false;
let cancelMovieTimer = null;

function disarmCancelMovie() {
  cancelMovieArmed = false;
  clearTimeout(cancelMovieTimer);
  const button = $('#cancel-movie');
  button.textContent = 'Отменить этот фильм';
  button.classList.remove('btn-armed');
}

$('#cancel-movie').addEventListener('click', async () => {
  const button = $('#cancel-movie');
  const movie = state.page?.movie;
  if (!movie || button.disabled) return;

  if (!cancelMovieArmed) {
    cancelMovieArmed = true;
    button.textContent = 'Точно?';
    button.classList.add('btn-armed');
    clearTimeout(cancelMovieTimer);
    cancelMovieTimer = setTimeout(disarmCancelMovie, 4000);
    return;
  }

  disarmCancelMovie();
  button.disabled = true;
  try {
    const data = await serverApi(`/api/movies/${encodeURIComponent(movie.id)}/cancel`, {
      method: 'POST',
    });
    setStatus(
      data.canceled
        ? `Отменено задач этого фильма: ${data.canceled}`
        : 'Нечего отменять: незаконченных задач у этого фильма нет',
    );
    if (data.movie) renderMovieSummary(data.movie); // свежие счётчики в предупреждении
    await refreshQueue();
  } catch (error) {
    setStatus(`Не удалось отменить: ${error.message}`);
  } finally {
    button.disabled = false;
  }
});

/* сворачиваемая очередь */
$('#queue-toggle').addEventListener('click', async () => {
  state.queueCollapsed = !state.queueCollapsed;
  applyQueueCollapsed();
  try {
    await ext.storage.local.set({ [UI_KEY]: { queueCollapsed: state.queueCollapsed } });
  } catch {
    // настройка интерфейса не критична — если не сохранилась, просто живём дальше
  }
});

$('#queue-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  button.disabled = true;
  try {
    await serverApi(`/api/tasks/${button.dataset.id}/${button.dataset.action}`, { method: 'POST' });
    await refreshQueue();
  } catch (error) {
    setStatus(`Не удалось: ${error.message}`);
  }
});

$('#resume-all').addEventListener('click', async () => {
  try {
    const data = await serverApi('/api/tasks/resume-all', { method: 'POST' });
    setStatus(data.resumed ? `Продолжаем задач: ${data.resumed}` : 'На паузе ничего нет');
    await refreshQueue();
  } catch (error) {
    setStatus(`Не удалось: ${error.message}`);
  }
});

$('#stop-all').addEventListener('click', async (event) => {
  const button = event.target;
  // Подтверждение вторым кликом, без браузерных окон.
  if (button.dataset.armed !== '1') {
    button.dataset.armed = '1';
    button.textContent = 'Точно?';
    setTimeout(() => {
      button.dataset.armed = '0';
      button.textContent = 'Остановить все';
    }, 4000);
    return;
  }

  button.dataset.armed = '0';
  button.textContent = 'Остановить все';
  try {
    const data = await serverApi('/api/tasks/cancel-all', { method: 'POST' });
    setStatus(data.canceled ? `Отменено задач: ${data.canceled}` : 'Нечего отменять');
    await refreshQueue();
  } catch (error) {
    setStatus(`Не удалось: ${error.message}`);
  }
});

/* ───────────────────────────────── запуск ──────────────────────────────── */

const POLL_MS = 3000;

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(refreshQueue, POLL_MS);
}

init().finally(() => {
  refreshQueue();
  startPolling();
});

// Пока попап не виден, опрос сервера не нужен: возвращаемся — обновляем сразу.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  } else {
    refreshQueue();
    startPolling();
  }
});

window.addEventListener('unload', () => {
  if (state.pollTimer) clearInterval(state.pollTimer);
});