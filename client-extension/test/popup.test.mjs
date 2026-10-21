/**
 * Тесты проводки попапа (client-extension/popup.js) — тем самым мини-DOM и
 * стабами chrome.*, которыми раньше проверяли парсеры и сборку задач.
 *
 * Запуск:  node client-extension/test/popup.test.mjs
 *
 * Проверяем то, что видно только в связке: попап сам выбирает дубляж (и именно
 * им запрашивает ссылки у сайта), сам ставит «1080p Ultra», пробует вес только
 * у качеств 720p и выше, а если у дубляжа нет ссылок — возвращается на озвучку
 * сайта и говорит об этом.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, '..', name), 'utf8');

let failed = 0;
let passed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}\n       ожидалось: ${JSON.stringify(expected)}\n       получилось: ${JSON.stringify(actual)}`);
  }
}

/* ─────────────────────────────── мини-DOM ─────────────────────────────── */

function makeClassList(initial = []) {
  const names = new Set(initial);
  return {
    add: (...list) => list.forEach((name) => names.add(name)),
    remove: (...list) => list.forEach((name) => names.delete(name)),
    contains: (name) => names.has(name),
    toggle: (name, force) => {
      const on = force === undefined ? !names.has(name) : Boolean(force);
      if (on) names.add(name);
      else names.delete(name);
      return on;
    },
  };
}

function makeElement(selector = '') {
  const handlers = {};
  const node = {
    selector,
    className: '',
    classList: makeClassList(),
    children: [],
    dataset: {},
    style: {},
    value: '',
    textContent: '',
    innerHTML: '',
    title: '',
    disabled: false,
    checked: false,
    scrollHeight: 0,
    appendChild(child) {
      node.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      node[name] = value;
    },
    addEventListener(type, handler) {
      (handlers[type] ??= []).push(handler);
    },
    // Клик в тестах: попап развешивает обработчики через addEventListener,
    // а нажимаем мы их отсюда (нужно для кнопки отмены фильма).
    click() {
      for (const handler of handlers.click ?? []) handler({ target: node, preventDefault() {} });
    },
    focus() {},
    getBoundingClientRect: () => ({ top: 10, bottom: 40, left: 10, right: 210, width: 200, height: 30 }),
    querySelectorAll(selector) {
      const name = String(selector).replace(/^\./, '');
      return node.children.filter((child) => String(child.className).split(/\s+/).includes(name));
    },
    querySelector(selector) {
      return node.querySelectorAll(selector)[0] ?? null;
    },
  };
  return node;
}

const PAGE_URL = 'https://hdrezka.ag/films/test-2020.html';

/** Страница hdrezka так, как её разбирает pageDetect (только нужные поля). */
function filmPage(translators, activeId) {
  return {
    pageType: 'FILM',
    movie: { action: 'get_movie', id: '1234', translator_id: activeId, is_camrip: null, is_ads: null, is_director: null, favs: '' },
    quality: '720p', // качество плеера: попап его больше не копирует
    year: '2020',
    translators,
    hasCall: true,
    callArgs: [],
    url: PAGE_URL,
    category: 'films',
    title: 'Test',
    origTitle: 'Test',
  };
}

const voice = (id, title, prem = false) => ({
  id,
  title,
  prem,
  flag: 'ru',
  is_camrip: null,
  is_ads: null,
  is_director: null,
});

/** Список качеств в том же формате, в каком его отдаёт сайт. */
const QUALITY_URL = '[1080p Ultra]https://cdn.test/1080u.mp4,[1080p]https://cdn.test/1080.mp4,[720p]https://cdn.test/720.mp4,[360p]https://cdn.test/360.mp4,[2K]https://cdn.test/2k.mp4';

/**
 * Поднимает попап в песочнице: настоящие defaults.js и popup.js, стабы
 * chrome, fetch и DOM. `resolve` получает запрос к сайту и возвращает ответ.
 * `movieSummary` — что сервер отвечает про этот фильм (сводка для «уже
 * скачивалось»), `onMovieCancel` — ответ на «отменить этот фильм».
 */
async function startPopup({ page, resolve, movieSummary = { total: 0 }, onMovieCancel = null }) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, makeElement(selector));
    return elements.get(selector);
  };
  // В разметке эти блоки приходят скрытыми.
  for (const selector of ['#quality-list', '#settings', '#controls', '#queue', '#subs-row', '#subs-lang-wrap', '#range-custom', '#space-warn', '#already', '#collect', '#cancel-movie']) {
    element(selector).classList.add('hidden');
  }
  element('#range-mode').value = 'all';
  element('#cancel-movie').textContent = 'Отменить этот фильм';

  const probeCalls = [];
  const resolveCalls = [];
  const requests = [];

  const document = {
    documentElement: { outerHTML: '' },
    querySelector: element,
    querySelectorAll: () => [],
    createElement: (tag) => makeElement(`<${tag}>`),
    addEventListener() {},
  };

  const storage = {};
  const storageArea = {
    get: async (key) => (key === undefined ? {} : { [key]: storage[key] }),
    set: async (values) => Object.assign(storage, values),
  };

  const chrome = {
    storage: { local: storageArea, sync: storageArea },
    tabs: { query: async () => [{ id: 1, url: page.url }] },
    runtime: { getManifest: () => ({ version: 'test' }) },
    scripting: {
      async executeScript({ func, args = [] }) {
        const name = func?.name ?? '';
        if (name === 'pageDetect') return [{ result: page }];
        if (name === 'pageSeasons') return [{ result: {} }];
        if (name === 'pageResolve') {
          const request = args[0];
          resolveCalls.push(request);
          return [{ result: resolve(request) }];
        }
        return [{ result: null }]; // строчные функции попапа (readJob и т.п.)
      },
    },
  };

  const fetch = async (url, options = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const method = options.method ?? 'GET';
    requests.push({ path, method });

    if (path.startsWith('/api/movies/')) {
      if (path.endsWith('/cancel')) {
        const body = onMovieCancel ? onMovieCancel(movieSummary) : { canceled: 0, movie: movieSummary };
        return { ok: true, status: 200, json: async () => body };
      }
      return { ok: true, status: 200, json: async () => movieSummary };
    }

    const body = { server: { freeSpace: 1e12, saveDir: '/media', needBytes: 0, spaceEnough: true }, stats: {}, tasks: [], settings: { max_concurrent: 2 } };
    return { ok: true, status: 200, json: async () => body };
  };

  const sandbox = {
    chrome,
    document,
    window: { innerHeight: 600, innerWidth: 400, addEventListener() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch,
    // Как в браузере: на не-base64 atob бросает, и decodeVideoURL берёт строку
    // как есть (в фикстурах ссылки лежат открытым текстом).
    atob: (value) => {
      const text = String(value);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('InvalidCharacterError');
      return Buffer.from(text, 'base64').toString('binary');
    },
    AbortController: class {
      constructor() {
        this.signal = {};
      }
      abort() {}
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    console,
    // Проба качества здесь не проверяется (это probe.test.mjs): важно лишь,
    // какие качества и ссылки попап отдаёт в пробу.
    HdzgProbe: {
      probeQuality: async (urls, options) => {
        probeCalls.push({ urls, pageUrl: options?.pageUrl ?? null });
        return null;
      },
    },
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(read('defaults.js'), sandbox, { filename: 'defaults.js' });
  vm.runInContext(read('popup.js'), sandbox, { filename: 'popup.js' });

  storage['hdzg-server-settings'] = { serverUrl: 'http://127.0.0.1:9', token: '', updatedAt: Date.now() };
  storage['hdzg-server-ui'] = {};

  const hook = vm.runInContext('({ state, init, renderSubtitles })', sandbox);
  return {
    hook,
    element,
    probeCalls,
    resolveCalls,
    requests,
    status: () => element('#action-status').textContent,
  };
}

/** Ждём, пока фоновая init() (она запускается при загрузке попапа) дойдёт до конца. */
async function waitFor(condition, label) {
  for (let step = 0; step < 400; step++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`не дождались: ${label}`);
}

const settle = (hook) => waitFor(() => hook.state.page !== null, 'страница разобрана');

/* ─────────────────── 1. Дубляж и качество по умолчанию ───────────────────── */

console.log('Фильм: озвучка сайта «HDrezka Studio», в списке есть дубляж');

const dubPopups = await startPopup({
  page: filmPage([voice('0', 'HDrezka Studio'), voice('110', 'Оригинал'), voice('42', 'Дубляж (Кириллица)')], '0'),
  resolve: () => ({ success: true, url: QUALITY_URL, subtitle: '', subtitle_lns: {}, seasons: '' }),
});
await settle(dubPopups.hook);
await waitFor(() => dubPopups.hook.state.probePending.size === 0, 'пробы закончились');

check('ссылки запрошены у дубляжа, а не у озвучки сайта', dubPopups.resolveCalls[0]?.translator_id, '42');
check('у дубляжа ссылки есть — отката не было', dubPopups.resolveCalls.length, 1);
check('озвучка в списке — дубляж', dubPopups.element('#voiceover').value, '42');
check('качество по умолчанию — 1080p Ultra', dubPopups.element('#quality').value, '1080p Ultra');
check(
  'пробуются только 720p и выше (каждая — со своей ссылкой)',
  dubPopups.probeCalls.map((call) => call.urls[0]).sort(),
  ['https://cdn.test/1080.mp4', 'https://cdn.test/1080u.mp4', 'https://cdn.test/2k.mp4', 'https://cdn.test/720.mp4'],
);
check('проба знает страницу-источник (для Referer)', dubPopups.probeCalls.every((call) => call.pageUrl === PAGE_URL), true);

/* ──────────────── 2. Дубляжа нет — остаётся озвучка сайта ────────────────── */

console.log('\nФильм без дубляжа: остаётся озвучка сайта');

const noDub = await startPopup({
  page: filmPage([voice('0', 'HDrezka Studio'), voice('17', 'LostFilm')], '17'),
  resolve: () => ({ success: true, url: QUALITY_URL, subtitle: '', subtitle_lns: {}, seasons: '' }),
});
await settle(noDub.hook);

check('ссылки запрошены у озвучки сайта', noDub.resolveCalls[0]?.translator_id, '17');
check('повторного запроса не было', noDub.resolveCalls.length, 1);
check('озвучка в списке — как на сайте', noDub.element('#voiceover').value, '17');
check('качество по умолчанию всё то же', noDub.element('#quality').value, '1080p Ultra');

/* ────── 3. У дубляжа нет ссылок (сериал озвучен не весь) — откат ─────────── */

console.log('\nСериал: дубляж без ссылок — возвращаемся на озвучку сайта');

const fallback = await startPopup({
  page: {
    ...filmPage([voice('0', 'HDrezka Studio'), voice('42', 'Дубляж (Кириллица)')], '0'),
    pageType: 'SERIAL',
    movie: { action: 'get_stream', id: '777', translator_id: '0', season: '1', episode: '2', favs: '' },
  },
  resolve: (request) =>
    request.translator_id === '42'
      ? { success: true, url: '', subtitle: '', subtitle_lns: {}, seasons: '' }
      : { success: true, url: QUALITY_URL, subtitle: '', subtitle_lns: {}, seasons: '' },
});
await settle(fallback.hook);
await waitFor(() => fallback.resolveCalls.length === 2, 'второй запрос (озвучка сайта)');

check('сначала пробовали дубляж, потом озвучку сайта', fallback.resolveCalls.map((call) => call.translator_id), ['42', '0']);
check('в списке снова озвучка сайта', fallback.element('#voiceover').value, '0');
check('в озвучке страницы — тоже она', fallback.hook.state.page.movie.translator_id, '0');
check(
  'об откате сказано в статусе',
  fallback.status().includes('нет этой серии') && fallback.status().includes('Дубляж (Кириллица)'),
  true,
);
check('качества приехали от озвучки сайта', Object.keys(fallback.hook.state.resolved.qualities).length, 5);

/* ─────────── 4. Только низкие качества: пробу не запускаем вовсе ─────────── */

console.log('\nФильм только с 360p/480p: качества ниже 720p не пробуются');

const lowOnly = await startPopup({
  page: filmPage([voice('0', 'HDrezka Studio'), voice('42', 'Дубляж (Кириллица)')], '0'),
  resolve: () => ({
    success: true,
    url: '[360p]https://cdn.test/360.mp4,[480p]https://cdn.test/480.mp4',
    subtitle: '',
    subtitle_lns: {},
    seasons: '',
  }),
});
await settle(lowOnly.hook);

check('качество по умолчанию — ближайшее из доступных', lowOnly.element('#quality').value, '480p');
check('ни одной пробы не запущено', lowOnly.probeCalls.length, 0);
check('строки не висят в ожидании пробы', lowOnly.hook.state.probePending.size, 0);
check(
  'в подсказке объяснено, почему нет веса',
  lowOnly.element('#quality-btn').title,
  'Вес и разрешение не пробуем: качество ниже 720p',
);

/* ────────────────── 5. Субтитры: русские и включены сразу ────────────────── */

console.log('\nСубтитры: русский язык и галочка — базовые значения');

const SUBTITLE_URL = '[Русский]https://cdn.test/rus.vtt,[English]https://cdn.test/eng.vtt';

const withSubs = await startPopup({
  page: filmPage([voice('0', 'HDrezka Studio')], '0'),
  resolve: () => ({
    success: true,
    url: QUALITY_URL,
    subtitle: SUBTITLE_URL,
    subtitle_lns: { Русский: 'rus', English: 'eng' },
    seasons: '',
  }),
});
await settle(withSubs.hook);
await waitFor(() => withSubs.hook.state.resolved?.subtitles?.length === 2, 'субтитры разобрались');

check('галочка «Скачивать субтитры» стоит сразу', withSubs.element('#subs-enabled').checked, true);
check('язык субтитров — русский', withSubs.element('#subs-lang').value, 'Русский');
check('ряд субтитров виден', withSubs.element('#subs-row').classList.contains('hidden'), false);
check('выбор языка не спрятан', withSubs.element('#subs-lang-wrap').classList.contains('hidden'), false);

const noRussianSubs = await startPopup({
  page: filmPage([voice('0', 'HDrezka Studio')], '0'),
  resolve: () => ({
    success: true,
    url: QUALITY_URL,
    subtitle: '[English]https://cdn.test/eng.vtt',
    subtitle_lns: { English: 'eng' },
    seasons: '',
  }),
});
await settle(noRussianSubs.hook);
await waitFor(() => noRussianSubs.hook.state.resolved?.subtitles?.length === 1, 'субтитры разобрались');

check('русских субтитров нет — галочку не ставим', noRussianSubs.element('#subs-enabled').checked, false);
check('ряд субтитров всё равно виден', noRussianSubs.element('#subs-row').classList.contains('hidden'), false);

// Пользователь снял галочку — смена озвучки не должна включать её обратно.
withSubs.hook.state.subsTouched = true;
withSubs.element('#subs-enabled').checked = false;
withSubs.element('#subs-lang').value = 'English';
withSubs.hook.renderSubtitles();

check('снятую пользователем галочку не возвращаем', withSubs.element('#subs-enabled').checked, false);
check('выбранный пользователем язык тоже остаётся', withSubs.element('#subs-lang').value, 'English');
check(
  'и язык скрыт, раз галочка снята',
  withSubs.element('#subs-lang-wrap').classList.contains('hidden'),
  true,
);

/* ──────────────── 6. Отмена задач текущего фильма одной кнопкой ──────────── */

console.log('\n«Этот фильм уже качается»: кнопка отмены без поиска в очереди');

const ACTIVE_SUMMARY = {
  total: 3,
  done: 1,
  downloading: 1,
  queued: 1,
  paused: 0,
  error: 0,
  canceled: 0,
  filesOnDisk: 1,
};

const cancelMovie = await startPopup({
  page: filmPage([voice('0', 'HDrezka Studio')], '0'),
  resolve: () => ({ success: true, url: QUALITY_URL, subtitle: '', subtitle_lns: {}, seasons: '' }),
  movieSummary: ACTIVE_SUMMARY,
  // Сервер отменяет всё незаконченное и возвращает свежую сводку.
  onMovieCancel: (summary) => ({
    canceled: summary.downloading + summary.queued + summary.paused,
    movie: { ...summary, downloading: 0, queued: 0, paused: 0, canceled: 2 },
  }),
});
await settle(cancelMovie.hook);
await waitFor(() => cancelMovie.requests.some((item) => item.path.startsWith('/api/movies/')), 'сводка по фильму');

check('предупреждение «уже скачивалось» показано', cancelMovie.element('#already').classList.contains('hidden'), false);
check(
  'в тексте предупреждения счётчики',
  cancelMovie.element('#already-text').textContent.includes('1 качается, 1 в очереди'),
  true,
);
check('кнопка отмены видна', cancelMovie.element('#cancel-movie').classList.contains('hidden'), false);
check('подпись кнопки', cancelMovie.element('#cancel-movie').textContent, 'Отменить этот фильм');

cancelMovie.element('#cancel-movie').click();
check(
  'первый клик — только подтверждение, сервер не трогаем',
  [
    cancelMovie.element('#cancel-movie').textContent,
    cancelMovie.requests.some((item) => item.path.endsWith('/cancel')),
  ],
  ['Точно?', false],
);

cancelMovie.element('#cancel-movie').click();
await waitFor(
  () => cancelMovie.requests.some((item) => item.path.endsWith('/cancel')),
  'запрос на отмену фильма',
);
// Отмена заканчивается не ответом запроса, а перерисовкой сводки — дожидаемся её.
await waitFor(
  () => cancelMovie.element('#cancel-movie').classList.contains('hidden'),
  'сводка после отмены перерисована',
);

check(
  'второй клик отменяет задачи именно этого фильма',
  cancelMovie.requests.filter((item) => item.path.endsWith('/cancel')).map((item) => [item.method, item.path]),
  [['POST', '/api/movies/1234/cancel']],
);
check('в статусе сказано, сколько отменено', cancelMovie.status(), 'Отменено задач этого фильма: 2');
check('подпись кнопки вернулась', cancelMovie.element('#cancel-movie').textContent, 'Отменить этот фильм');
check(
  'отменять больше нечего — кнопка спряталась',
  cancelMovie.element('#cancel-movie').classList.contains('hidden'),
  true,
);

// Ничего не качается (только готовое) — кнопки нет вовсе.
const doneOnly = await startPopup({
  page: filmPage([voice('0', 'HDrezka Studio')], '0'),
  resolve: () => ({ success: true, url: QUALITY_URL, subtitle: '', subtitle_lns: {}, seasons: '' }),
  movieSummary: { ...ACTIVE_SUMMARY, downloading: 0, queued: 0, canceled: 0 },
});
await settle(doneOnly.hook);
await waitFor(() => doneOnly.requests.some((item) => item.path.startsWith('/api/movies/')), 'сводка по фильму');

check('всё готово — предупреждение видно, кнопки нет', [
  doneOnly.element('#already').classList.contains('hidden'),
  doneOnly.element('#cancel-movie').classList.contains('hidden'),
], [false, true]);

console.log(`\nИтог: ${passed} ok, ${failed} FAIL`);
process.exit(failed ? 1 : 0);