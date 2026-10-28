/**
 * Адаптер MangaLib.
 *
 * Сайт — SPA, но каталог и главы отдаёт обычный JSON API
 * (`api.imglib.info/api`, резерв — `api.cdnlibs.org/api`). Поэтому Chromium
 * здесь не нужен: ни при старте сервера, ни при разборе тайтла. Это важно,
 * потому что headless Chromium остаётся только для com-x.life и запускается
 * лениво, по требованию (browser.js).
 *
 * Один запрос к API — один тайтл/глава. Страницы главы отдаются путями
 * (`//manga/...`), а не полными URL; хост берём из `/constants?fields[]=
 * imageServers` и подставляем сами. Если хост недоступен, перебираем
 * остальные зеркала.
 */

import { config } from '../config.js';
import { chapterFolderName, sanitizeName, seriesFolderName } from './naming.js';

export const SOURCE = 'mangalib';
export const LABEL = 'MangaLib';

const API_BASES = ['https://api.imglib.info/api', 'https://api.cdnlibs.org/api'];
const API_REFERER = 'https://mangalib.me/';
const USER_AGENT = `idk-downloader/${config.version} (+https://github.com/flaemer-idk/idk-downloader)`;
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const JSON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  Referer: API_REFERER,
  'site-id': '1',
};

const IMAGE_HEADERS = {
  'User-Agent': BROWSER_UA,
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  Referer: API_REFERER,
};

const EXT_BY_TYPE = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

/** API отвечает ~100 запросов/мин; 700 мс — это ~85/мин, как у DownloadLib. */
const MIN_API_INTERVAL_MS = 700;
const MIN_IMAGE_INTERVAL_MS = 80;
let lastApiAt = 0;
let lastImageAt = 0;
let apiBaseIndex = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? '').trim();
}

function compareNumberLike(a, b) {
  const na = Number.parseFloat(String(a).replace(',', '.'));
  const nb = Number.parseFloat(String(b).replace(',', '.'));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function extFromUrl(raw) {
  const match = String(raw || '').match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  return match ? '.' + match[1].toLowerCase() : null;
}

export function extFor(contentType, fallbackExt) {
  return EXT_BY_TYPE[contentType] || fallbackExt || '.jpg';
}

/**
 * URL тайтла MangaLib: `https://mangalib.me/ru/manga/206--one-piece`.
 * Также принимаем mangalib.org, API-URL и голый slug.
 */
export function parseMangaLibUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const isSite =
    host === 'mangalib.me' ||
    host === 'mangalib.org' ||
    host.endsWith('.mangalib.me') ||
    host.endsWith('.mangalib.org');
  const isApi = host === 'api.imglib.info' || host === 'api.cdnlibs.org';
  if (!isSite && !isApi) return null;

  const segments = url.pathname
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  let slug = '';
  const mangaIndex = segments.indexOf('manga');
  if (mangaIndex !== -1) slug = segments[mangaIndex + 1] || '';
  if (!slug) slug = segments.find((part) => /^\d+--[\w-]+$/i.test(part)) || '';
  if (!slug) return null;

  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  if (!slug || slug === '.' || slug === '..' || /[/\\]/.test(slug)) return null;

  return { kind: 'manga', slug };
}

export function isMangaLibUrl(raw) {
  return parseMangaLibUrl(raw) !== null;
}

/** Название для папки: русское, затем оригинальное/английское. */
export function pickTitle(data = {}) {
  return (
    clean(data.rus_name) ||
    clean(data.name) ||
    clean(data.eng_name) ||
    'Без названия'
  );
}

/** «1997 г.» / «2020-05-01» → «1997» / «2020». */
export function yearFrom(value) {
  const match = String(value ?? '').match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

function teamNames(branch) {
  const teams = Array.isArray(branch?.teams) ? branch.teams : [];
  return teams
    .map((team) => clean(team?.name))
    .filter(Boolean)
    .join(', ');
}

/** Основная ветка перевода: id главы, иначе первая. */
export function pickBranch(item = {}) {
  const branches = Array.isArray(item.branches) ? item.branches : [];
  if (!branches.length) return null;
  return branches.find((branch) => String(branch.id) === String(item.id)) || branches[0];
}

function readNumber(value, fallback) {
  const text = clean(value);
  return text || fallback;
}

/** Сырой chapter из `/chapters` → наша глава (без downloaded/pending). */
export function chapterFromApi(item, slugUrl) {
  const volume = readNumber(item.volume, '1');
  const number = readNumber(item.number, '1');
  const title = clean(item.name);
  const branch = pickBranch(item);
  const branchId = branch?.branch_id || null;
  const group = teamNames(branch) || null;
  const urlSlug = clean(slugUrl || item.slug_url);

  return {
    id: String(item.id ?? branch?.id ?? `${volume}-${number}`),
    volume,
    number,
    title,
    folder: sanitizeName(chapterFolderName({ num: number, title }, 'ru')),
    language: 'ru',
    group,
    external: false,
    unavailable: false,
    pages: 0,
    url: urlSlug
      ? `https://mangalib.me/ru/manga/${urlSlug}/read?volume=${encodeURIComponent(
          volume,
        )}&number=${encodeURIComponent(number)}`
      : null,
    branchId,
    slugUrl: urlSlug,
    publishAt: branch?.created_at || item.created_at || null,
    rawTitle: title,
  };
}

export function sortChapters(chapters) {
  return [...chapters].sort(
    (a, b) =>
      compareNumberLike(a.volume, b.volume) ||
      compareNumberLike(a.number, b.number) ||
      String(a.title || '').localeCompare(String(b.title || ''), 'ru'),
  );
}

function chapterRank(chapter) {
  return [
    chapter.group && chapter.group !== 'Неизвестный' ? 0 : 1,
    chapter.publishAt ? Date.parse(chapter.publishAt) : Number.MAX_SAFE_INTEGER,
  ];
}

function betterChapter(a, b) {
  const left = chapterRank(a);
  const right = chapterRank(b);
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? a : b;
  }
  return a;
}

/**
 * На один volume|number может прийти несколько записей (разные ветки/
 * переводы). В одну папку качаем одну: сначала с именованной группой, затем
 * самую раннюю. Остальные остаются в API, но не в очереди.
 */
export function collapseDuplicates(chapters) {
  const byNumber = new Map();
  for (const chapter of chapters) {
    const key = `${chapter.volume}|${chapter.number}`;
    const previous = byNumber.get(key);
    byNumber.set(key, previous ? betterChapter(previous, chapter) : chapter);
  }
  return [...byNumber.values()];
}

function apiUrl(path, params = {}) {
  const base = API_BASES[apiBaseIndex] || API_BASES[0];
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function throttleApi() {
  const wait = lastApiAt + MIN_API_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastApiAt = Date.now();
}

async function throttleImage() {
  const wait = lastImageAt + MIN_IMAGE_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastImageAt = Date.now();
}

/**
 * JSON API с паузой и повторами. Если один API-хост не отвечает, пробуем
 * второй (у MangaLib сейчас два рабочих зеркала API).
 */
export async function apiJson(path, params = {}, { attempts = 3 } = {}) {
  let lastError = null;
  const startedAt = apiBaseIndex;

  for (let baseTry = 0; baseTry < API_BASES.length; baseTry++) {
    const baseIndex = (startedAt + baseTry) % API_BASES.length;
    apiBaseIndex = baseIndex;

    for (let attempt = 0; attempt < attempts; attempt++) {
      await throttleApi();
      try {
        const response = await fetch(apiUrl(path, params), {
          headers: JSON_HEADERS,
          signal: AbortSignal.timeout(30000),
          redirect: 'follow',
        });

        if (response.status === 429) {
          lastError = new Error('MangaLib: слишком много запросов (429)');
          const retryAfter = Number(response.headers.get('retry-after'));
          await sleep(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 30000)
              : 1000 * (attempt + 1),
          );
          continue;
        }

        if (response.status === 403) {
          lastError = new Error(
            'MangaLib вернул 403 (DDoS-Guard). Попробуйте позже или проверьте сеть',
          );
          break;
        }

        if (response.status >= 500) {
          lastError = new Error(`MangaLib: HTTP ${response.status}`);
          await sleep(700 * (attempt + 1));
          continue;
        }

        if (!response.ok) {
          let detail = '';
          try {
            detail = (await response.text()).slice(0, 200);
          } catch {
            /* тело не нужно */
          }
          const error = new Error(
            `MangaLib: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`,
          );
          error.fatal = true;
          throw error;
        }

        const payload = await response.json();
        const toast = payload?.data?.toast;
        if (toast?.message && toast.type === 'silent') {
          const error = new Error(`MangaLib: ${toast.message}`);
          error.fatal = true;
          throw error;
        }
        return payload;
      } catch (error) {
        lastError = error;
        if (error.fatal) throw error;
        if (attempt < attempts - 1) await sleep(700 * (attempt + 1));
      }
    }
  }

  throw lastError || new Error('MangaLib: запрос не удался');
}

let serverCache = { at: 0, urls: [] };
const SERVER_CACHE_MS = 20 * 60 * 1000;
const FALLBACK_IMAGE_SERVERS = [
  'https://img3.cdnlibs.org',
  'https://img2.imglib.info',
  'https://img3.cdnrulib.link',
  'https://crops.mangalib.me',
];

/** URL-хосты картинок из /constants, с кэшем и разумным fallback. */
export async function imageServers() {
  if (serverCache.urls.length && Date.now() - serverCache.at < SERVER_CACHE_MS) {
    return serverCache.urls;
  }

  try {
    const payload = await apiJson('/constants', { 'fields[]': 'imageServers' }, { attempts: 2 });
    const list = Array.isArray(payload?.data?.imageServers)
      ? payload.data.imageServers
      : [];
    const forSite = list.filter(
      (server) =>
        clean(server?.url) &&
        (!Array.isArray(server.site_ids) || server.site_ids.includes(1)),
    );
    // download — оригиналы, main/secondary — обычные зеркала, crop — последним
    // средством (может быть уже обрезанным).
    const priority = { download: 0, main: 1, secondary: 2, compress: 3, crop: 4 };
    const urls = [...forSite]
      .sort((a, b) => (priority[a.id] ?? 9) - (priority[b.id] ?? 9))
      .map((server) => clean(server.url).replace(/\/+$/, ''))
      .filter(Boolean);

    if (urls.length) {
      serverCache = { at: Date.now(), urls: [...new Set(urls)] };
      return serverCache.urls;
    }
  } catch {
    /* ниже fallback — без него качать нечем, но не валим разбор тайтла */
  }

  serverCache = { at: Date.now(), urls: FALLBACK_IMAGE_SERVERS };
  return serverCache.urls;
}

/** Путь страницы из API — либо полный URL, либо `//manga/...`. */
export function pagePath(page) {
  const raw = clean(page?.url || page?.image);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  // `//host/path` — настоящий protocol-relative URL; `//manga/...` — путь.
  if (/^\/\/[^/]+\.[^/]+/.test(raw)) return `https:${raw}`;
  return raw.replace(/^\/+/, '');
}

/** Полный URL страницы: base + путь (или готовый внешний URL). */
export function imageUrl(base, path) {
  const raw = clean(path);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = clean(base).replace(/\/+$/, '');
  return `${origin}/${raw.replace(/^\/+/, '')}`;
}

/** Разбор тайтла: детали + главы, без Chromium. */
export async function resolveMangaLib(rawUrl) {
  const parsed = parseMangaLibUrl(rawUrl);
  if (!parsed) throw new Error('не удалось определить тайтл MangaLib из ссылки');

  const slug = encodeURIComponent(parsed.slug);
  const detailsPayload = await apiJson(`/manga/${slug}`);
  const data = detailsPayload?.data;
  if (!data || (!data.slug_url && !data.slug)) {
    throw new Error('MangaLib не вернул данные тайтла');
  }
  if (data.id === undefined || data.id === null) {
    throw new Error('MangaLib не вернул id тайтла');
  }
  if (data.model && data.model !== 'manga') {
    throw new Error('это не манга, а другой тип тайтла MangaLib');
  }

  const slugUrl = clean(data.slug_url || data.slug);
  const chaptersPayload = await apiJson(`/manga/${encodeURIComponent(slugUrl)}/chapters`);
  const rawChapters = Array.isArray(chaptersPayload?.data) ? chaptersPayload.data : [];
  if (!rawChapters.length) {
    throw new Error('MangaLib не вернул список глав для этого тайтла');
  }

  const chapters = sortChapters(
    collapseDuplicates(
      rawChapters
        .filter((item) => item && (item.number !== undefined || item.id !== undefined))
        .map((item) => chapterFromApi(item, slugUrl)),
    ),
  );

  const title = sanitizeName(pickTitle(data)) || 'Без названия';
  const year = yearFrom(data.releaseDateString);

  return {
    source: SOURCE,
    sourceLabel: LABEL,
    seriesKey: `mangalib:${data.id}`,
    url: `https://mangalib.me/ru/manga/${slugUrl}`,
    title,
    year,
    folder: seriesFolderName(title, year),
    language: 'ru',
    languages: [],
    chapters,
  };
}

/**
 * Страницы главы: `/manga/{slug}/chapter?volume=&number=[&branch_id=]`.
 * Возвращает хосты и относительные пути; скачивание — fetchImage().
 */
export async function chapterImages(chapter) {
  if (!chapter?.slugUrl) throw new Error('у главы MangaLib нет slug тайтла');
  const params = {
    volume: chapter.volume,
    number: chapter.number,
  };
  if (chapter.branchId) params.branch_id = chapter.branchId;

  const payload = await apiJson(
    `/manga/${encodeURIComponent(chapter.slugUrl)}/chapter`,
    params,
  );
  const data = payload?.data;
  if (!data) throw new Error('MangaLib не вернул главу');
  if (data.bundle && data.bundle.is_open === false) {
    throw new Error('глава платная (закрытый том MangaLib) — её нельзя скачать без покупки');
  }
  if (data.restricted_view && data.restricted_view.is_open === false) {
    throw new Error('глава закрыта на MangaLib (ограниченный доступ)');
  }
  if (Array.isArray(data.content) && !Array.isArray(data.pages)) {
    throw new Error('это текстовый тайтл, а не манга');
  }

  const rawPages = Array.isArray(data.pages) ? data.pages : [];
  const pages = [...rawPages].sort((a, b) =>
    compareNumberLike(a?.slug ?? a?.page ?? 0, b?.slug ?? b?.page ?? 0),
  );
  const images = pages
    .map((page) => {
      const pageUrl = pagePath(page);
      return pageUrl
        ? { path: pageUrl, extFromUrl: extFromUrl(pageUrl) }
        : null;
    })
    .filter(Boolean);

  if (!images.length) throw new Error('у главы нет страниц');

  return {
    source: SOURCE,
    hosts: await imageServers(),
    referer: API_REFERER,
    images,
  };
}

/** Скачивает одну страницу, перебирая зеркала и повторяя попытки. */
export async function fetchImage(imageSet, index, { attempts = 3 } = {}) {
  const page = imageSet.images[index];
  if (!page) throw new Error('нет такой страницы');
  const direct = /^https?:\/\//i.test(page.path);
  const candidates = direct
    ? [page.path]
    : imageSet.hosts.map((host) => imageUrl(host, page.path)).filter(Boolean);

  let lastError = new Error('нет доступных серверов картинок MangaLib');
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const url of candidates) {
      try {
        await throttleImage();
        const response = await fetch(url, {
          headers: IMAGE_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(30000),
        });
        if (response.status === 429) {
          lastError = new Error('MangaLib: слишком много запросов к картинкам (429)');
          await sleep(1000 * (attempt + 1));
          continue;
        }
        if (response.status !== 200) {
          lastError = new Error(`MangaLib: HTTP ${response.status}`);
          continue;
        }

        const contentType = (response.headers.get('content-type') || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!contentType.startsWith('image/') || buffer.length < 100) {
          lastError = new Error(
            `MangaLib: не картинка (${contentType}, ${buffer.length} байт)`,
          );
          continue;
        }
        return { buffer, contentType };
      } catch (error) {
        lastError = error;
      }
    }
    if (attempt < attempts - 1) await sleep(700 * (attempt + 1));
  }

  throw lastError || new Error('MangaLib: не удалось скачать страницу');
}