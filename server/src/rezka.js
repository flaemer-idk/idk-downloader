/**
 * Rezka resolver for the Add-by-link cards.
 *
 * The site is HTML + a small AJAX player; there is no public JSON API. Cookies
 * from Settings (Netscape export) are needed for favorites and sometimes for
 * the player session. This module never trusts a user-supplied Referer: the
 * page URL is the referer.
 */

import * as db from './db.js';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_TTL_MS = 5 * 60 * 1000;
const pageCache = new Map();

const QUALITY_OPTIONS = ['Auto', '2160p', '1080p Ultra', '1080p', '720p', '480p'];

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripTags(value) {
  return decodeEntities(String(value ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function isRezkaUrl(raw) {
  try {
    const host = new URL(String(raw)).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'rezka.fi' || host === 'rezka.ag' || host.endsWith('.rezka.fi');
  } catch {
    return false;
  }
}

/** Netscape cookie export → Cookie header. Lines with fewer than 7 fields are skipped. */
export function cookieHeader(text) {
  const pairs = [];
  for (let line of String(text || '').split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('#HttpOnly_')) line = line.slice('#HttpOnly_'.length);
    else if (line.startsWith('#')) continue;
    const fields = line.split('\t');
    if (fields.length < 7) continue;
    const name = fields[5]?.trim();
    const value = fields[6]?.trim();
    if (name) pairs.push(`${name}=${value ?? ''}`);
  }
  return pairs.join('; ');
}

function headersFor(url) {
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    Referer: 'https://rezka.fi/',
  };
  const cookies = cookieHeader(db.getSettings().rezka_cookies);
  if (cookies) headers.Cookie = cookies;
  return headers;
}

async function fetchText(url) {
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < PAGE_TTL_MS) return cached.text;
  const response = await fetch(url, {
    headers: headersFor(url),
    redirect: 'follow',
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Rezka: HTTP ${response.status}`);
  const text = await response.text();
  pageCache.set(url, { at: Date.now(), text });
  return text;
}

function pageId(url) {
  const match = String(url).match(/\/(\d+)-[^/]+\.html/i);
  return match ? match[1] : null;
}

function pageSection(url) {
  const match = String(url).match(/\/(films|series|animation|cartoons)\//i);
  return match ? match[1].toLowerCase() : 'films';
}

/** Parse one title page. Exported for tests. */
export function parseRezkaPage(html, url) {
  const h1 = /<h1[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const ogTitle = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const title = stripTags(h1?.[1] || ogTitle?.[1] || '');
  const yearMatch =
    String(ogTitle?.[1] || '').match(/\((\d{4})\)/) ||
    String(url).match(/-(\d{4})(?:-latest)?\.html/i) ||
    String(html).match(/\/year\/(\d{4})\//);
  const ageMatch =
    /<h2>\s*Возраст\s*<\/h2>[\s\S]{0,300}?(\d{1,2}\+)/i.exec(html) ||
    (/(?:Для взрослых|только для взрослых)/i.test(html) ? ['18+'] : null);
  const rating = ageMatch ? String(ageMatch[1] || '18+') : 'any';
  const id = pageId(url) || (/data-id=["'](\d+)["']/i.exec(html) || [])[1] || null;
  const section = pageSection(url);
  const hasEpisodes = /data-season_id=["']\d+["']/i.test(html);
  const kind = section === 'series' || hasEpisodes ? 'series' : 'film';

  const translators = [];
  const translatorRe =
    /<li[^>]*data-translator_id=["'](\d+)["'][^>]*>([\s\S]*?)<\/li>/gi;
  let tMatch;
  while ((tMatch = translatorRe.exec(html))) {
    const name = stripTags(tMatch[2]);
    if (!name) continue;
    if (!translators.some((item) => item.id === tMatch[1])) {
      translators.push({ id: tMatch[1], name });
    }
  }

  // У фильмов с единственным переводом на странице нет списка
  // b-translator__item: название лежит в строке «В переводе», а id —
  // в вызове initCDN...Events. Без этого карточка выглядела как «нет озвучки».
  const translationName = stripTags(
    /<h2[^>]*>\s*В переводе\s*<\/h2>\s*:?\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(html)?.[1] ||
      '',
  );
  const embeddedTranslatorId =
    /initCDN\w*Events\(\s*\d+\s*,\s*["']?(\d+)["']?/i.exec(html)?.[1] || null;
  if (!translators.length && translationName) {
    translators.push({ id: embeddedTranslatorId, name: translationName });
  }
  const activeTranslator =
    /<li[^>]*class=["'][^"']*b-translator__item[^"']*active[^"']*["'][^>]*data-translator_id=["'](\d+)["']/i.exec(
      html,
    )?.[1] ||
    translators[0]?.id ||
    embeddedTranslatorId ||
    null;

  const episodes = [];
  const episodeRe =
    /<li[^>]*data-season_id=["'](\d+)["'][^>]*data-episode_id=["'](\d+)["'][^>]*>([\s\S]*?)<\/li>/gi;
  let eMatch;
  while ((eMatch = episodeRe.exec(html))) {
    episodes.push({
      id: `s${eMatch[1]}e${eMatch[2]}`,
      season: eMatch[1],
      episode: eMatch[2],
      title: stripTags(eMatch[3]) || `Серия ${eMatch[2]}`,
    });
  }

  return {
    id,
    url,
    title: title || 'Без названия',
    year: yearMatch ? yearMatch[1] : '',
    section,
    kind,
    rating,
    translators,
    activeTranslator,
    episodes,
  };
}

async function episodeListFor(page) {
  if (page.kind !== 'series' || !page.id) return page.episodes;
  const translator = page.activeTranslator || page.translators[0]?.id;
  if (!translator) return page.episodes;
  const t = Date.now();
  const response = await fetch(
    `https://rezka.fi/ajax/get_cdn_series/?t=${t}`,
    {
      method: 'POST',
      headers: {
        ...headersFor(page.url),
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: new URLSearchParams({
        id: page.id,
        translator_id: translator,
        action: 'get_episodes',
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (!response.ok) throw new Error(`Rezka: HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.success) return page.episodes;
  const html = String(data.episodes || '');
  const episodes = [];
  const re = /<li[^>]*data-season_id=["'](\d+)["'][^>]*data-episode_id=["'](\d+)["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = re.exec(html))) {
    episodes.push({
      id: `s${match[1]}e${match[2]}`,
      season: match[1],
      episode: match[2],
      title: stripTags(match[3]) || `Серия ${match[2]}`,
    });
  }
  return episodes.length ? episodes : page.episodes;
}

function doneTasks() {
  try {
    return db.listTasks(1000).filter((task) => task.status === 'done');
  } catch {
    return [];
  }
}

function downloadedCount(page, episodes = []) {
  const tasks = doneTasks();
  const sameTitle = tasks.filter(
    (task) =>
      String(task.title || '').trim().toLowerCase() === page.title.toLowerCase() &&
      (!task.year || !page.year || String(task.year) === String(page.year)),
  );
  if (page.kind !== 'series') return sameTitle.length ? 1 : 0;
  return episodes.filter((episode) =>
    sameTitle.some(
      (task) =>
        String(task.season || '') === String(episode.season) &&
        String(task.episode || '') === String(episode.episode),
    ),
  ).length;
}

async function targetUrls(url) {
  const text = await fetchText(url);
  const parsed = new URL(url);
  if (parsed.pathname.includes('/franchises/')) {
    const urls = [];
    const re = /class=["'][^"']*b-post__partcontent_item[^"']*["'][^>]*data-url=["']([^"']+)["']/gi;
    let match;
    while ((match = re.exec(text))) urls.push(decodeEntities(match[1]));
    return [...new Set(urls)].slice(0, 50);
  }
  if (parsed.pathname.includes('/favorites/')) {
    const urls = [];
    const re = /href=["'](https?:\/\/rezka\.[^"']+\/(?:films|series|animation|cartoons)\/[^"']+\.html)["']/gi;
    let match;
    while ((match = re.exec(text))) urls.push(decodeEntities(match[1]));
    return [...new Set(urls)].slice(0, 50);
  }
  return [url];
}

async function cardFor(url) {
  const html = await fetchText(url);
  const page = parseRezkaPage(html, url);
  let episodes = await episodeListFor(page);
  if (page.kind === 'series') {
    episodes = episodes.map((episode) => ({ ...episode, downloaded: false }));
  }
  const tasks = doneTasks().filter(
    (task) =>
      String(task.title || '').trim().toLowerCase() === page.title.toLowerCase() &&
      (!task.year || !page.year || String(task.year) === String(page.year)),
  );
  const doneEpisodes = new Set(
    tasks.map((task) => `${String(task.season || '')}|${String(task.episode || '')}`),
  );
  const downloaded = page.kind === 'series'
    ? episodes.filter((episode) => doneEpisodes.has(`${episode.season}|${episode.episode}`)).length
    : tasks.length
      ? 1
      : 0;
  return {
    id: page.id || url,
    url: page.url,
    title: page.title,
    origTitle: page.title,
    year: page.year,
    kind: page.kind,
    section: page.section,
    rating: page.rating,
    translatorId: page.activeTranslator,
    quality: '1080p',
    qualityOptions: QUALITY_OPTIONS,
    voiceover: page.translators.find((item) => item.id === page.activeTranslator)?.name ||
      page.translators[0]?.name || null,
    voiceovers: page.translators.map((item) => item.name).filter(Boolean),
    subtitles: ['ru'],
    downloaded,
    total: page.kind === 'series' ? episodes.length : 1,
    episodes: episodes.map((episode) => ({
      ...episode,
      downloaded: doneEpisodes.has(`${episode.season}|${episode.episode}`),
    })),
  };
}

/** POST /api/tasks/preview → { source, url, cards } */
export async function preview(url) {
  if (!isRezkaUrl(url)) {
    return {
      source: 'direct',
      url,
      cards: [
        {
          id: url,
          url,
          title: decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Файл'),
          origTitle: '',
          year: '',
          kind: 'film',
          section: 'films',
          rating: 'any',
          quality: '1080p',
          qualityOptions: QUALITY_OPTIONS,
          voiceover: 'Оригинал',
          voiceovers: ['Оригинал'],
          subtitles: /\.vtt(?:$|\?)/i.test(url) ? ['ru'] : [],
          downloaded: 0,
          total: 1,
          episodes: [],
        },
      ],
    };
  }

  const urls = await targetUrls(url);
  const cards = [];
  for (const target of urls) {
    try {
      cards.push(await cardFor(target));
    } catch {
      // One broken title should not kill the whole franchise.
    }
  }
  if (!cards.length) throw new Error('Rezka не вернула карточки для этой ссылки');
  return { source: 'rezka', url, cards };
}

function parseQualityBlocks(raw) {
  const blocks = [];
  const re = /\[(\d+p)\]([\s\S]*?)(?=\s*\[\d+p\]|$)/gi;
  let match;
  while ((match = re.exec(String(raw || '')))) {
    const urls = [];
    for (const part of match[2].split(/\s+or\s+/)) {
      const url = part.trim().split(':hls:manifest.m3u8')[0].replace(/:hls:manifest\.m3u8$/i, '');
      if (/^https?:\/\//i.test(url)) urls.push(url);
    }
    blocks.push({ quality: match[1], urls });
  }
  return blocks;
}

function chooseQuality(blocks, requested) {
  if (!blocks.length) throw new Error('Rezka не вернула поток');
  const wanted = String(requested || 'auto').toLowerCase();
  if (wanted === 'auto') {
    return blocks[blocks.length - 1];
  }
  const digits = Number((wanted.match(/(\d{3,4})/) || [])[1]) || 1080;
  const sorted = [...blocks].sort(
    (a, b) => Number.parseInt(a.quality, 10) - Number.parseInt(b.quality, 10),
  );
  return sorted.find((block) => Number.parseInt(block.quality, 10) >= digits) ||
    sorted[sorted.length - 1];
}

async function streamFor(page, selection, episode) {
  const translatorId =
    selection.translatorId || page.activeTranslator || page.translators[0]?.id || null;
  const params = {
    id: page.id,
    action: page.kind === 'series' ? 'get_stream' : 'get_movie',
  };
  if (translatorId) params.translator_id = translatorId;
  if (page.kind === 'series') {
    params.season = episode?.season;
    params.episode = episode?.episode;
  }
  if (!translatorId && page.kind === 'series') {
    throw new Error('У тайтла нет озвучки');
  }
  const response = await fetch(`https://rezka.fi/ajax/get_cdn_series/?t=${Date.now()}`, {
    method: 'POST',
    headers: {
      ...headersFor(page.url),
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Rezka: HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.success) throw new Error(data?.message || 'Rezka не отдала поток');
  const blocks = parseQualityBlocks(data.url);
  const block = chooseQuality(blocks, selection.quality);
  return {
    url: block.urls[0],
    quality: block.quality,
    subtitle: typeof data.subtitle === 'string' && /^https?:\/\//i.test(data.subtitle)
      ? data.subtitle
      : null,
  };
}

/**
 * Resolve selected cards into task input objects. The frontend sends cards
 * from /api/tasks/preview; files are not touched here.
 */
export async function resolveSelections(items) {
  const tasks = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.url || !isRezkaUrl(item.url)) continue;
    const html = await fetchText(item.url);
    const page = parseRezkaPage(html, item.url);
    const chosenVoice = page.translators.find((translator) => translator.name === item.voiceover);
    const itemWithVoice = {
      ...item,
      translatorId: chosenVoice?.id || item.translatorId || page.activeTranslator,
    };
    const selected = Array.isArray(item.episodes) ? item.episodes : [];
    if (page.kind === 'series' && !selected.length) {
      throw new Error(`«${page.title}»: выберите хотя бы одну серию`);
    }
    const episodes = page.kind === 'series' ? selected : [null];
    for (const episode of episodes) {
      const stream = await streamFor(page, itemWithVoice, episode);
      if (!stream.url) continue;
      tasks.push({
        url: stream.url,
        referer: item.url,
        title: page.title,
        orig_title: item.origTitle || page.title,
        year: page.year,
        quality: stream.quality,
        voiceover: item.voiceover || null,
        season: episode?.season || null,
        episode: episode?.episode || null,
        episode_title: episode?.title || null,
        category: page.section,
        kind: page.kind,
        rating: page.rating,
        file_type: 'video',
      });
      if (stream.subtitle && item.subtitles) {
        tasks.push({
          url: stream.subtitle,
          referer: item.url,
          title: page.title,
          orig_title: item.origTitle || page.title,
          year: page.year,
          quality: stream.quality,
          voiceover: item.voiceover || null,
          season: episode?.season || null,
          episode: episode?.episode || null,
          episode_title: episode?.title || null,
          category: page.section,
          kind: page.kind,
          rating: page.rating,
          file_type: 'subtitle',
          subtitle_lang: 'Русский',
          subtitle_lang_code: 'rus',
        });
      }
    }
  }
  return tasks;
}
