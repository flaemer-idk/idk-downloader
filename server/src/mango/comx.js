/**
 * Адаптер ComX (com-x.life): разбор ссылок, скачивание картинок.
 * HTML-страницы читает browser.js (DleGuard пропускает только настоящий
 * Chromium; серверный fetch тарпитится — см. prototypes/mango/mango.md),
 * а картинки DleGuard не охраняет — их качаем обычным fetch.
 */

export const BASE = 'https://com-x.life';

// Как у Chrome: без Accept хост картинок молча подвешивает запрос (проверено).
const IMAGE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
};

const EXT_BY_TYPE = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

/** Хосты-зеркала, ссылки на которые принимаем. */
export function isComxUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return false;
  }
  if (!/^https?:$/.test(url.protocol)) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return host === 'com-x.life' || host.endsWith('.com-x.life');
}

/** Страница тайтла DLE: /26588-sui-i-neri.html */
export function isMangaPageUrl(raw) {
  if (!isComxUrl(raw)) return false;
  const url = new URL(String(raw));
  return /\/\d+-[^/]*\.html?$/.test(url.pathname);
}

/** news_id из ссылки на тайтл: /26588-....html → 26588 */
export function newsIdFromUrl(raw) {
  const match = String(raw).match(/\/(\d+)-/);
  return match ? match[1] : null;
}

export function readerUrlFor(newsId, chapterId) {
  return `${BASE}/reader/${newsId}/${chapterId}`;
}

function extFromUrl(path) {
  const match = String(path).match(/\.([a-z0-9]+)$/i);
  return match ? '.' + match[1].toLowerCase() : null;
}

export function extFor(contentType, fallbackExt) {
  return EXT_BY_TYPE[contentType] || fallbackExt || '.jpg';
}

/** Страницы главы из данных читалки: [{path, extFromUrl}], хосты в порядке попыток. */
export function pagesFromReaderData(data) {
  const hosts = [
    ...new Set([data.host, data.host_ru, 'img.com-x.life', 'rus.com-x.life'].filter(Boolean)),
  ];
  return {
    hosts,
    images: (data.images || []).map((path) => ({
      path: String(path),
      extFromUrl: extFromUrl(path),
    })),
  };
}

/** Скачивает одну картинку, перебирая хосты и повторяя попытки. */
export async function fetchImage(page, hosts, referer, { attempts = 3, pauseMs = 120 } = {}) {
  let lastError = new Error('нет доступных хостов картинок');
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const host of hosts) {
      const url = `https://${host}/comix/${page.path}`;
      try {
        if (pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
        const response = await fetch(url, {
          headers: { ...IMAGE_HEADERS, Referer: referer },
          redirect: 'follow',
        });
        if (response.status !== 200) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        const contentType = (response.headers.get('content-type') || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!contentType.startsWith('image/') || buffer.length < 100) {
          lastError = new Error(`не картинка (${contentType}, ${buffer.length} байт)`);
          continue;
        }
        return { buffer, contentType };
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError;
}