/**
 * Адаптер MangaDex (API v5).
 *
 * Важно: `mangadex.org` может быть заблокирован, но `api.mangadex.org`,
 * `uploads.mangadex.org` и `*.mangadex.network` обычно доступны. Поэтому здесь
 * нет ни одного запроса к HTML-странице сайта: только официальный API.
 *
 * Источник не использует Chromium. Страницы главы отдаёт at-home API; URL
 * живёт ~15 минут, поэтому при 403/410 перезапрашиваем at-home и пробуем
 * страницу ещё раз.
 */

import { config } from '../config.js';
import { chapterFolderName, sanitizeName, seriesFolderName } from './naming.js';

export const SOURCE = 'mangadex';
export const LABEL = 'MangaDex';

const API_BASE = 'https://api.mangadex.org';
const REPORT_URL = 'https://api.mangadex.network/report';
const USER_AGENT = `idk-downloader/${config.version} (+https://github.com/flaemer-idk/idk-downloader)`;
const JSON_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
const IMAGE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
};

/** MangaDex просит ~5 запросов/сек; 230 мс — чуть медленнее и безопаснее. */
const MIN_API_INTERVAL_MS = 230;
const MIN_AT_HOME_INTERVAL_MS = 1500; // at-home: 40 запросов/мин
let lastApiAt = 0;
let lastAtHomeAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extFromName(name) {
  const match = String(name).match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  return match ? '.' + match[1].toLowerCase() : null;
}

function apiUrl(path, params = {}) {
  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
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

async function throttleAtHome() {
  const wait = lastAtHomeAt + MIN_AT_HOME_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastAtHomeAt = Date.now();
}

/**
 * Запрос к API с паузой, повторами на 429/5xx и понятной ошибкой на 403.
 * 403 у MangaDex — это чаще всего бан IP после игнорирования 429.
 */
export async function apiJson(path, params = {}, { attempts = 4 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await throttleApi();
    try {
      const response = await fetch(apiUrl(path, params), {
        headers: JSON_HEADERS,
        signal: AbortSignal.timeout(30000),
        redirect: 'follow',
      });

      if (response.status === 429) {
        lastError = new Error('MangaDex: слишком много запросов (429)');
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 30000)
            : 1000 * (attempt + 1),
        );
        continue;
      }

      if (response.status === 403) {
        const error = new Error(
          'MangaDex вернул 403: запросы заблокированы (проверьте VPN/прокси или подождите)',
        );
        error.fatal = true;
        throw error;
      }

      if (response.status >= 500) {
        lastError = new Error(`MangaDex: HTTP ${response.status}`);
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
          `MangaDex: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`,
        );
        error.fatal = true;
        throw error;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (error.fatal) throw error;
      if (attempt < attempts - 1) await sleep(700 * (attempt + 1));
    }
  }
  throw lastError || new Error('MangaDex: запрос не удался');
}

/** UUID из ссылки на тайтл/главу/API. HTML-страницу не открываем. */
export function parseMangaDexUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'mangadex.org' && host !== 'api.mangadex.org') return null;

  const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
  const title = new RegExp(`/title/${uuid}(?:/|$)`, 'i').exec(url.pathname);
  if (title) return { kind: 'manga', id: title[1].toLowerCase() };
  const chapter = new RegExp(`/chapter/${uuid}(?:/|$)`, 'i').exec(url.pathname);
  if (chapter) return { kind: 'chapter', id: chapter[1].toLowerCase() };
  const mangaApi = new RegExp(`/manga/${uuid}(?:/|$)`, 'i').exec(url.pathname);
  if (mangaApi) return { kind: 'manga', id: mangaApi[1].toLowerCase() };
  return null;
}

export function isMangaDexUrl(raw) {
  return parseMangaDexUrl(raw) !== null;
}

/** Название для папки: всегда сначала русское, даже если качаем en-главы. */
export function pickTitle(attributes = {}) {
  const title = attributes.title && typeof attributes.title === 'object' ? attributes.title : {};
  const alt = Array.isArray(attributes.altTitles) ? attributes.altTitles : [];
  const fromAlt = (lang) => {
    for (const item of alt) {
      if (item && typeof item[lang] === 'string' && item[lang].trim()) return item[lang].trim();
    }
    return '';
  };
  const clean = (value) => (typeof value === 'string' ? value.trim() : '');

  return (
    clean(title.ru) ||
    fromAlt('ru') ||
    clean(title.en) ||
    fromAlt('en') ||
    clean(title[attributes.originalLanguage]) ||
    Object.values(title).map(clean).find(Boolean) ||
    'Без названия'
  );
}

export function sortLanguages(list) {
  const priority = { ru: 0, en: 1 };
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean).map(String))].sort(
    (a, b) => (priority[a] ?? 2) - (priority[b] ?? 2) || a.localeCompare(b),
  );
}

export function defaultLanguage(languages, preferred = null) {
  if (preferred && languages.includes(preferred)) return preferred;
  if (languages.includes('ru')) return 'ru';
  if (languages.includes('en')) return 'en';
  return languages[0] || 'ru';
}

function languageCandidates(languages, preferred) {
  const ordered = [];
  const push = (value) => {
    if (value && !ordered.includes(value)) ordered.push(value);
  };
  if (preferred) push(preferred);
  push('ru');
  push('en');
  for (const code of languages) push(code);
  return ordered.slice(0, 5);
}

function relationshipGroup(item) {
  const groups = (item.relationships || []).filter((rel) => rel.type === 'scanlation_group');
  return groups
    .map((rel) => rel.attributes?.name)
    .filter(Boolean)
    .join(', ');
}

function chapterNumber(value) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text || '1';
}

function compareNumbers(a, b) {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Сырой chapter из feed → наша глава (без downloaded/pending). */
export function chapterFromApi(item, language) {
  const attributes = item.attributes || {};
  const number = chapterNumber(attributes.chapter);
  const volume = chapterNumber(attributes.volume);
  const title = attributes.title ? String(attributes.title).trim() : '';
  const external = Boolean(attributes.externalUrl);
  const pages = Number(attributes.pages) || 0;
  return {
    id: String(item.id),
    volume,
    number,
    title,
    folder: sanitizeName(chapterFolderName({ num: number, title }, language)),
    language,
    group: relationshipGroup(item),
    external,
    unavailable: Boolean(attributes.isUnavailable) || (pages === 0 && !external),
    pages,
    url: `https://mangadex.org/chapter/${item.id}`,
    publishAt: attributes.publishAt || null,
    rawTitle: title,
  };
}

function chapterRank(chapter) {
  return [
    chapter.external ? 1 : 0,
    chapter.unavailable ? 1 : 0,
    -chapter.pages,
    chapter.publishAt ? Date.parse(chapter.publishAt) : Number.MAX_SAFE_INTEGER,
  ];
}

function betterChapter(a, b) {
  const left = chapterRank(a);
  const right = chapterRank(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? a : b;
  }
  return a;
}

/**
 * На один номер может быть несколько scanlation-групп. В одну папку качаем
 * только одну: сначала не-external/доступную, потом с большим числом страниц,
 * потом самую раннюю. Остальные остаются в API, но не в очереди.
 */
export function collapseDuplicates(chapters) {
  const byNumber = new Map();
  for (const chapter of chapters) {
    // Строковый ключ, а не parseFloat: 1.1 и 1.10 — разные главы.
    const key = `${chapter.volume}|${chapter.number}`;
    const previous = byNumber.get(key);
    byNumber.set(key, previous ? betterChapter(previous, chapter) : chapter);
  }
  return [...byNumber.values()];
}

export function sortChapters(chapters) {
  return [...chapters].sort(
    (a, b) => compareNumbers(a.volume, b.volume) || compareNumbers(a.number, b.number),
  );
}

/** URL страницы: baseUrl + /data/{hash}/{filename}. */
export function imageUrl(baseUrl, hash, filename, quality = 'data') {
  const root = String(baseUrl).replace(/\/+$/, '');
  return `${root}/${quality === 'saver' ? 'data-saver' : 'data'}/${hash}/${filename}`;
}

async function fetchFeed(mangaId, language) {
  const chapters = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total && offset < 10000) {
    const page = await apiJson(`/manga/${encodeURIComponent(mangaId)}/feed`, {
      'translatedLanguage[]': [language],
      'includes[]': ['scanlation_group'],
      'order[volume]': 'asc',
      'order[chapter]': 'asc',
      limit: 100,
      offset,
      // includeExternalUrl/includeEmptyPages/includeUnavailable — это фильтры
      // «только external/пустые/недоступные», а не «включить». Не передаём:
      // нужны обычные главы и external (их помечаем в UI).
    });
    const data = Array.isArray(page.data) ? page.data : [];
    total = Number(page.total) || 0;
    chapters.push(...data);
    if (!data.length) break;
    offset += data.length;
  }
  return chapters;
}

function hasUsableChapter(items) {
  return items.some((item) => {
    const attributes = item.attributes || {};
    return (
      !attributes.externalUrl &&
      !attributes.isUnavailable &&
      (Number(attributes.pages) || 0) > 0
    );
  });
}

/**
 * Ссылка на тайтл или главу → метаданные + главы выбранного языка.
 * `language` — код MangaDex (`ru`, `en`, `pt-br`, …); без него выбираем
 * русский, потом английский, потом первый доступный.
 */
export async function resolveMangaDex(rawUrl, { language } = {}) {
  const parsed = parseMangaDexUrl(rawUrl);
  if (!parsed) {
    throw new Error(
      'Нужна ссылка на MangaDex вида https://mangadex.org/title/<uuid>/… или https://mangadex.org/chapter/<uuid>',
    );
  }

  let mangaId = parsed.id;
  let chapterLanguage = null;
  if (parsed.kind === 'chapter') {
    const chapter = await apiJson(`/chapter/${encodeURIComponent(parsed.id)}`, {
      'includes[]': ['manga', 'scanlation_group'],
    });
    const mangaRel = (chapter.data?.relationships || []).find((rel) => rel.type === 'manga');
    if (!mangaRel) throw new Error('MangaDex: у главы не нашлась манга');
    mangaId = mangaRel.id;
    chapterLanguage = chapter.data?.attributes?.translatedLanguage || null;
  }

  const manga = await apiJson(`/manga/${encodeURIComponent(mangaId)}`, {
    'includes[]': ['cover_art'],
  });
  const attributes = manga.data?.attributes || {};
  const available = sortLanguages([
    ...(Array.isArray(attributes.availableTranslatedLanguages)
      ? attributes.availableTranslatedLanguages
      : []),
    chapterLanguage,
  ]);

  const requested = language ? String(language).toLowerCase() : null;
  if (requested && available.length && !available.includes(requested)) {
    throw new Error(
      `На MangaDex нет глав на языке «${requested}». Доступно: ${available.join(', ')}`,
    );
  }

  const candidates = requested
    ? [requested]
    : languageCandidates(available, chapterLanguage || defaultLanguage(available));
  let chosen = null;
  let rawChapters = null;

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const items = await fetchFeed(mangaId, candidate);
    if (!items.length) continue;
    rawChapters = items;
    chosen = candidate;
    // Если язык выбран автоматически и в нём только external/пустые главы,
    // пробуем следующий; последний кандидат оставляем как есть.
    if (requested || hasUsableChapter(items) || index === candidates.length - 1) break;
  }

  if (!chosen || !rawChapters) {
    throw new Error(
      `На MangaDex нет доступных глав${requested ? ` на языке «${requested}»` : ''}`,
    );
  }

  const chapters = sortChapters(
    collapseDuplicates(rawChapters.map((item) => chapterFromApi(item, chosen))),
  );

  const title = pickTitle(attributes);
  const year = attributes.year ? String(attributes.year) : null;

  return {
    source: SOURCE,
    sourceLabel: LABEL,
    seriesKey: `mangadex:${mangaId}`,
    url: `https://mangadex.org/title/${mangaId}`,
    title,
    year,
    folder: seriesFolderName(title, year),
    language: chosen,
    languages: sortLanguages([...available, chosen]),
    chapters,
  };
}

/** at-home: baseUrl + hash + имена файлов. */
export async function chapterImages(chapter) {
  await throttleAtHome();
  const data = await apiJson(`/at-home/server/${encodeURIComponent(chapter.id)}`);
  const chapterData = data.chapter || {};
  const files = Array.isArray(chapterData.data) ? chapterData.data : [];
  if (!data.baseUrl || !chapterData.hash || !files.length) {
    throw new Error('MangaDex не вернул страницы главы (at-home)');
  }
  const baseUrl = String(data.baseUrl).replace(/\/+$/, '');
  return {
    chapterId: chapter.id,
    baseUrl,
    hash: chapterData.hash,
    images: files.map((filename, index) => ({
      index,
      filename,
      urls: [imageUrl(baseUrl, chapterData.hash, filename)],
      extFromUrl: extFromName(filename),
    })),
  };
}

export class AtHomeExpiredError extends Error {
  constructor() {
    super('MangaDex: ссылка на страницы истекла, обновляю at-home');
    this.code = 'at-home-expired';
  }
}

function reportImage(imageSet, url, success, bytes, duration, cached) {
  // MangaDex@Home просит сообщать о каждой картинке, но только для своих
  // серверов; uploads.mangadex.org не отчитывается. Ошибку отчёта игнорируем.
  if (!imageSet.baseUrl || imageSet.baseUrl.includes('mangadex.org')) return;
  void fetch(REPORT_URL, {
    method: 'POST',
    headers: { ...JSON_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      success,
      bytes: Number(bytes) || 0,
      duration: Number(duration) || 0,
      cached: Boolean(cached),
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

/** Одна попытка скачать страницу. 403/410 → сигнал перезапросить at-home. */
async function fetchImageOnce(imageSet, index) {
  const image = imageSet.images[index];
  if (!image) throw new Error(`MangaDex: нет страницы ${index + 1}`);
  const url = image.urls[0];
  const startedAt = Date.now();
  let response;

  try {
    response = await fetch(url, {
      headers: IMAGE_HEADERS,
      signal: AbortSignal.timeout(60000),
      redirect: 'follow',
    });
  } catch (error) {
    reportImage(imageSet, url, false, 0, Date.now() - startedAt, false);
    throw new Error(`MangaDex: сеть при скачивании страницы — ${error.message}`);
  }

  const duration = Date.now() - startedAt;
  if (response.status === 403 || response.status === 410) {
    reportImage(imageSet, url, false, 0, duration, false);
    throw new AtHomeExpiredError();
  }
  if (!response.ok) {
    reportImage(imageSet, url, false, 0, duration, false);
    throw new Error(`MangaDex: HTTP ${response.status} на странице ${index + 1}`);
  }

  const contentType = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!contentType.startsWith('image/') || buffer.length < 100) {
    reportImage(imageSet, url, false, buffer.length, duration, false);
    throw new Error(`MangaDex: не картинка (${contentType}, ${buffer.length} байт)`);
  }

  reportImage(
    imageSet,
    url,
    true,
    buffer.length,
    duration,
    (response.headers.get('x-cache') || '').toUpperCase().startsWith('HIT'),
  );
  return { buffer, contentType };
}

/** Скачивает страницу с повторами на сеть/5xx; 403/410 не повторяет. */
export async function fetchImage(imageSet, index, { attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetchImageOnce(imageSet, index);
    } catch (error) {
      lastError = error;
      if (error.code === 'at-home-expired') throw error;
      if (attempt < attempts - 1) await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}
