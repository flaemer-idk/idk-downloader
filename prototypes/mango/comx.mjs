// Адаптер com-x.life для прототипа mango.
// Контракт (см. mango.md «Модульность источников»): инфо о тайтле, страницы главы.
// Только встроенный fetch, без зависимостей. Рецепт парсинга — research.md
// (window.__DATA__) + mango.md (правила имён, заголовки, rate limit).

const BASE = 'https://com-x.life';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

// ~3 запроса/сек (mango.md) — пауза между запросами
const REQUEST_PAUSE_MS = 350;

// --- cookies (формат Netscape, как отдаёт «Get cookies.txt») ---

export function loadCookieFile(text, { now = Date.now() / 1000 } = {}) {
  const cookies = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = line.split('\t').map((s) => s.trim());
    // domain  flag  path  secure  expiration  name  value
    if (parts.length < 7) continue;
    const [domain, , path, secure, expires, name, value] = parts;
    const expiry = Number(expires);
    cookies.push({
      domain,
      path,
      secure: secure === 'TRUE',
      expires: Number.isFinite(expiry) ? expiry : 0,
      name,
      value,
    });
  }
  return {
    headerFor(url) {
      const u = new URL(url);
      const host = u.hostname;
      const pairs = [];
      for (const c of cookies) {
        const dom = c.domain.replace(/^\./, '');
        // dot-domain покрывает сабдомены, голый — только точный хост
        if (c.domain.startsWith('.') ? host === dom || host.endsWith('.' + dom) : host === dom) {
          if (c.path !== '/' && !u.pathname.startsWith(c.path)) continue;
          if (c.expires > 0 && c.expires < now) continue;
          if (c.secure && u.protocol !== 'https:') continue;
          pairs.push(`${c.name}=${c.value}`);
        }
      }
      return pairs.join('; ');
    },
  };
}

// --- низкоуровневый fetch с браузерными заголовками ---

let lastRequestAt = 0;

async function politeFetch(url, headers) {
  const since = Date.now() - lastRequestAt;
  if (since < REQUEST_PAUSE_MS) {
    await new Promise((r) => setTimeout(r, REQUEST_PAUSE_MS - since));
  }
  lastRequestAt = Date.now();

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      ...headers,
    },
    redirect: 'follow',
  });
  return res;
}

// DleGuard на HTML-запрос без сессии отдаёт страницу проверки — по ней видно,
// что cookies не сработали (research.md: редирект на /_c?t=...)
function looksLikeChallenge(html) {
  return (
    html.includes('/_c?t=') ||
    /__guard|dle_guard/i.test(html.slice(0, 4000)) ||
    html.includes('Just a moment')
  );
}

// --- парсинг страницы тайтла ---

function extractDataBlobs(html) {
  const blobs = [];
  const re = /window\.__DATA__\s*=\s*(\{[\s\S]+?\});/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      blobs.push(JSON.parse(m[1]));
    } catch {
      // в прототипе просто пропускаем битый блоб
    }
  }
  return blobs;
}

export function sanitizeName(raw) {
  let s = String(raw)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/[. ]+$/, ''); // хвостовые точки/пробелы (Windows)
  if (s.length > 150) s = s.slice(0, 150).replace(/[. ]+$/, '');
  return s;
}

// «1 - 2.5 Экстра» → {vol:'1', num:'2.5', title:'Экстра'}
// «1 Кому улыбнётся мир?» → {vol:'1', num:'1', title:'Кому улыбнётся мир?'}
export function parseChapterString(raw) {
  const t = String(raw).trim();
  const numRe = /^(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)(?:\s+([\s\S]+))?$/;
  const sep = t.indexOf(' - ');
  if (sep !== -1) {
    const vol = t.slice(0, sep).trim();
    const rest = t.slice(sep + 3).trim();
    const m = rest.match(numRe);
    if (m && /^\d/.test(vol)) {
      return { vol, num: m[1], title: (m[2] || '').trim() };
    }
  }
  const m = t.match(numRe);
  if (m) return { vol: '1', num: m[1], title: (m[2] || '').trim() };
  return { vol: '1', num: '0', title: t };
}

export function newsIdFromUrl(url) {
  const m = String(url).match(/\/(\d+)-/);
  return m ? m[1] : null;
}

export async function getMangaInfo(mangaUrl, jar) {
  const res = await politeFetch(mangaUrl, {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    Cookie: jar.headerFor(mangaUrl),
    Referer: BASE,
  });
  const html = await res.text();
  if (res.status !== 200 || looksLikeChallenge(html)) {
    throw new Error(
      `страница тайтла не отдалась (HTTP ${res.status}${looksLikeChallenge(html) ? ', DleGuard-проверка' : ''}) — cookies протухли?`
    );
  }

  const titleMatch = html.match(/<h1[^>]*class="[^"]*flex-grow-1[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
  const title = titleMatch ? sanitizeName(titleMatch[1].replace(/<[^>]+>/g, '').trim()) : null;
  const yearMatch = html.match(/Год:<\/div>\s*<a[^>]*>\s*(\d{4})\s*<\/a>/);

  const blobs = extractDataBlobs(html);
  const data = blobs.find((b) => Array.isArray(b.chapters) && b.chapters.length);
  if (!data) throw new Error('window.__DATA__ с главами не найден на странице тайтла');

  const chapters = [...data.chapters]
    .sort((a, b) => (a.posi ?? 0) - (b.posi ?? 0))
    .map((c) => ({
      id: c.id,
      rawTitle: c.title ?? '',
      ...parseChapterString(c.title ?? ''),
    }));

  return {
    url: mangaUrl,
    newsId: newsIdFromUrl(mangaUrl),
    title,
    year: yearMatch ? yearMatch[1] : null,
    chapters,
  };
}

// --- страницы главы ---

const EXT_BY_TYPE = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

function extFromUrl(path) {
  const m = String(path).match(/\.([a-z0-9]+)$/i);
  return m ? '.' + m[1].toLowerCase() : null;
}

export async function getChapterPages(chapter, manga, jar, { readerCacheDir = null } = {}) {
  const readerUrl = `${BASE}/reader/${manga.newsId}/${chapter.id}`;

  // Режим «как будет с расширением»: данные читалки лежат в JSON рядом
  // (reader-{id}.json). Сервер в любом случае не может сам читать HTML —
  // DleGuard тарпитит не-браузерные TLS-отпечатки (проверено 2026-10-27).
  if (readerCacheDir) {
    const { readFile } = await import('node:fs/promises');
    const cachePath = `${readerCacheDir}/reader-${chapter.id}.json`;
    try {
      const data = JSON.parse(await readFile(cachePath, 'utf8'));
      return pagesFromReaderData(data, readerUrl);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  const res = await politeFetch(readerUrl, {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    Cookie: jar.headerFor(readerUrl),
    Referer: manga.url,
  });
  const html = await res.text();
  if (res.status !== 200 || looksLikeChallenge(html)) {
    throw new Error(`страница читалки не отдалась (HTTP ${res.status})`);
  }

  const data = extractDataBlobs(html).find((b) => Array.isArray(b.images) && b.images.length);
  if (!data) throw new Error('window.__DATA__ с картинками не найден на странице читалки');
  return pagesFromReaderData(data, readerUrl);
}

function pagesFromReaderData(data, readerUrl) {
  const hosts = [...new Set([data.host, data.host_ru, 'img.com-x.life', 'rus.com-x.life'].filter(Boolean))];
  return {
    readerUrl,
    hosts,
    // путь без хоста; полный URL собирается на хосте из списка
    images: data.images.map((p) => ({ path: String(p), extFromUrl: extFromUrl(p) })),
  };
}

// Инфо о тайтле из JSON, вынутого расширением со страницы тайтла
// (формат файла info-*.json: {url, title, year, chapters: [{id, title, posi}]})
export function mangaInfoFromJson(info) {
  return {
    url: info.url,
    newsId: newsIdFromUrl(info.url) ?? info.news_id ?? null,
    title: info.title ? sanitizeName(info.title) : null,
    year: info.year ?? null,
    chapters: [...(info.chapters ?? [])]
      .sort((a, b) => (a.posi ?? 0) - (b.posi ?? 0))
      .map((c) => ({
        id: c.id,
        rawTitle: c.title ?? '',
        ...parseChapterString(c.title ?? ''),
      })),
  };
}

// Скачивает одну картинку, перебирая хосты. Возвращает {buffer, contentType}.
export async function fetchImage(page, hosts, referer, jar, attempts = 3) {
  let lastErr = new Error('нет хостов');
  for (let i = 0; i < attempts; i++) {
    for (const host of hosts) {
      const url = `https://${host}/comix/${page.path}`;
      try {
        const res = await politeFetch(url, {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: referer,
          Cookie: jar.headerFor(url),
        });
        if (res.status !== 200) {
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const buf = Buffer.from(await res.arrayBuffer());
        if (!contentType.startsWith('image/') || buf.length < 100) {
          lastErr = new Error(`не картинка (${contentType}, ${buf.length}b)`);
          continue;
        }
        return { buffer: buf, contentType };
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr;
}

export function extFor(contentType, fallbackExt) {
  return EXT_BY_TYPE[contentType] || fallbackExt || '.jpg';
}

export { BASE, UA };
