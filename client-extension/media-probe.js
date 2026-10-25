/**
 * Проба медиафайла: примерный вес и реальное разрешение.
 *
 * Зачем: hdrezka подписывает качество «1080p», хотя внутри может лежать 720p,
 * а то и 429×729. В списке качеств показываем вес и то, что в файле на самом
 * деле, — чтобы выбирать осознанно.
 *
 * Как: Range-запрос на первые 128 КБ файла даёт полный размер (Content-Range),
 * а разбор MP4-боксов до `moov` → `stsd` — ширину и высоту кадра. Разборщик
 * намеренно минимальный (только чтение, ~150 строк, без зависимостей): нужен
 * лишь размер и кадр, тянуть ради этого медиабиблиотеку не хочется.
 * Для .m3u8 берём RESOLUTION/BANDWIDTH из плейлиста, если он оказался
 * мастер-плейлистом; из медиа-плейлиста разрешение узнать неоткуда.
 *
 * Запросы идут из контекста расширения (попап): CORS не мешает, а Referer/Origin
 * подставляет DNR-правило — без него CDN отвечает 404 (проверено).
 */

const HdzgProbe = (() => {
  const HEAD_BYTES = 128 * 1024; // первый запрос: шапка файла + начало moov
  const MOOV_MAX_BYTES = 2 * 1024 * 1024; // больше не бывает даже у длинных фильмов
  const BOX_PEEK_BYTES = 4 * 1024; // шапка бокса, который лежит за первым окном
  const DEFAULT_TIMEOUT_MS = 6000;
  const CACHE_KEY = 'idk-probe-cache';
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
  const CACHE_MAX_ENTRIES = 300;

  /** Кодеки, которые кладут в stsd видеодорожки (не путать с аудио). */
  const VIDEO_SAMPLE_ENTRIES = new Set([
    'avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp09', 'mp4v',
    'dvav', 'dva1', 'dvhe', 'dvh1', 'vp08',
  ]);

  const ext = globalThis.browser ?? globalThis.chrome;

  /* ───────────────────────────── выборки из буфера ─────────────────────────── */

  const ascii = (bytes, offset, length) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  const u16 = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1];

  function u32(bytes, offset) {
    return (
      (bytes[offset] * 0x1000000) +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3]
    );
  }

  function u64(bytes, offset) {
    // Размеры файлов не превышают 2^53, BigInt не нужен.
    return u32(bytes, offset) * 0x100000000 + u32(bytes, offset + 4);
  }

  /** Сколько байт просили и сколько реально пришло (сервер может дать больше). */
  function sliceOf(window, offset, length) {
    const start = offset - window.from;
    if (start < 0 || start + length > window.bytes.length) return null;
    return window.bytes.subarray(start, start + length);
  }

  /* ──────────────────────────── разбор MP4-боксов ─────────────────────────── */

  function parseBoxHeader(bytes, offset, total) {
    if (offset + 8 > bytes.length) return null;
    const size32 = u32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    let size = size32;
    let headerSize = 8;

    if (size32 === 1) {
      if (offset + 16 > bytes.length) return null;
      size = u64(bytes, offset + 8);
      headerSize = 16;
    } else if (size32 === 0) {
      // Бокс «до конца файла» — так иногда пишут последний mdat/moov.
      size = total != null ? total - offset : null;
    }
    return { type, size, headerSize };
  }

  function plausibleDimensions(width, height) {
    return width >= 32 && height >= 32 && width <= 8192 && height <= 8192;
  }

  /**
   * Ширина и высота кадра внутри moov.
   *
   * Идём не по строгой иерархии (moov/trak/mdia/minf/stbl/stsd), а поиском
   * маркеров: упаковщики кладут stsd на разную глубину, а нам нужна лишь
   * первая запись с видеокодеком. Порядок stsd для аудиодорожки пропускаем
   * по типу кодека. Если stsd не нашёлся (или moov обрезался) — берём tkhd,
   * там те же размеры в 16.16.
   */
  function findVideoDimensions(bytes) {
    let index = 0;
    while ((index = indexOfAscii(bytes, 'stsd', index)) !== -1) {
      const entry = index + 12; // 4 (version+flags) + 4 (entry_count) от начала данных
      if (entry + 36 <= bytes.length) {
        const codec = ascii(bytes, entry + 4, 4);
        const width = u16(bytes, entry + 32);
        const height = u16(bytes, entry + 34);
        if (VIDEO_SAMPLE_ENTRIES.has(codec) && plausibleDimensions(width, height)) {
          return { width, height, codec };
        }
      }
      index += 4;
    }

    index = 0;
    while ((index = indexOfAscii(bytes, 'tkhd', index)) !== -1) {
      const start = index - 4; // 'tkhd' — это поле type, бокс начинается на 4 раньше
      if (start >= 0) {
        const box = parseBoxHeader(bytes, start, null);
        if (box && box.size >= box.headerSize && start + box.size <= bytes.length) {
          const width = u32(bytes, start + box.size - 8) / 65536;
          const height = u32(bytes, start + box.size - 4) / 65536;
          if (plausibleDimensions(width, height)) return { width, height, codec: null };
        }
      }
      index += 4;
    }

    return null;
  }

  function indexOfAscii(bytes, marker, from) {
    const limit = bytes.length - marker.length;
    for (let i = Math.max(0, from); i <= limit; i++) {
      if (
        bytes[i] === marker.charCodeAt(0) &&
        bytes[i + 1] === marker.charCodeAt(1) &&
        bytes[i + 2] === marker.charCodeAt(2) &&
        bytes[i + 3] === marker.charCodeAt(3)
      ) {
        return i;
      }
    }
    return -1;
  }

  /* ─────────────────────────── сеть: Range и Referer ──────────────────────── */

  let ruleSeq = Math.floor(Math.random() * 1000000);

  /** Firefox отвергает DNR-правило с запрещёнными Sec-Fetch-* целиком. */
  const isGecko = (() => {
    try {
      return String(ext?.runtime?.getURL?.('') ?? '').startsWith('moz-extension://');
    } catch {
      return false;
    }
  })();

  /**
   * Прогоняет запрос с подменёнными Referer/Origin: CDN отдаёт файл только
   * с «правильным» referer'ом страницы. Без DNR (или если правило не встало)
   * запрос всё равно выполняется — просто может вернуться 403/404.
   */
  async function withMediaHeaders(targetUrl, pageUrl, run) {
    const dnr = ext?.declarativeNetRequest;
    if (!dnr?.updateSessionRules || !pageUrl) return run();

    let origin;
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      return run();
    }

    const id = ++ruleSeq;
    try {
      await dnr.updateSessionRules({
        removeRuleIds: [id],
        addRules: [
          {
            id,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [
                { header: 'Referer', operation: 'set', value: `${origin}/` },
                { header: 'Origin', operation: 'set', value: origin },
                ...(isGecko
                  ? []
                  : [
                      { header: 'Sec-Fetch-Site', operation: 'set', value: 'cross-site' },
                      { header: 'Sec-Fetch-Dest', operation: 'set', value: 'video' },
                    ]),
              ],
            },
            condition: { urlFilter: targetUrl, resourceTypes: ['xmlhttprequest', 'other'] },
          },
        ],
      });
    } catch {
      return run(); // правил нет — пробуем без них
    }

    try {
      return await run();
    } finally {
      try {
        await dnr.updateSessionRules({ removeRuleIds: [id] });
      } catch {
        // правило снесут при закрытии попапа — не повод падать
      }
    }
  }

  /** Тело ответа с ограничением: сервер вправе проигнорировать Range и отдать всё. */
  async function readCapped(response, limit) {
    if (!response.body?.getReader) {
      return new Uint8Array(await response.arrayBuffer()).subarray(0, limit);
    }
    const reader = response.body.getReader();
    const parts = [];
    let length = 0;
    try {
      while (length < limit) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        length += value.length;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // поток уже закрыт
      }
    }

    const out = new Uint8Array(Math.min(length, limit));
    let offset = 0;
    for (const part of parts) {
      if (offset >= out.length) break;
      const piece = part.subarray(0, out.length - offset);
      out.set(piece, offset);
      offset += piece.length;
    }
    return out;
  }

  /** @returns {{bytes: Uint8Array, from: number, total: number|null}} */
  async function fetchRange(url, pageUrl, start, end, signal) {
    return withMediaHeaders(url, pageUrl, async () => {
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        credentials: 'omit',
        signal,
      });
      if (response.status !== 206 && !response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const partial = response.status === 206;
      const bytes = await readCapped(response, partial ? end - start + 1 : end + 1);

      // Полный размер: у 206 он в Content-Range, у 200 — в Content-Length.
      let total = null;
      const contentRange = response.headers.get('Content-Range');
      const match = contentRange && /\/(\d+)\s*$/.exec(contentRange);
      if (match) total = Number(match[1]);
      else if (response.status === 200) {
        const length = Number(response.headers.get('Content-Length'));
        if (Number.isFinite(length) && length > 0) total = length;
      }

      return { bytes, from: partial ? start : 0, total };
    });
  }

  /* ─────────────────────────────── сами пробы ─────────────────────────────── */

  async function probeMp4(url, pageUrl, signal) {
    const head = await fetchRange(url, pageUrl, 0, HEAD_BYTES - 1, signal);
    const total = head.total;
    if (!total) return null;

    // Идём по верхнеуровневым боксам, пока не найдём moov: он либо в шапке
    // (faststart), либо в конце файла — тогда до него придётся «дойти» по размерам.
    let moov = null;
    let offset = 0;
    for (let step = 0; step < 64 && offset + 8 <= total; step++) {
      let header = sliceOf(head, offset, 16);
      if (!header) {
        const peek = await fetchRange(url, pageUrl, offset, offset + BOX_PEEK_BYTES - 1, signal);
        // Сервер вправе отдать файл целиком: тогда байты не от того смещения,
        // и дальше идти по размерам нельзя.
        if (peek.from !== offset) break;
        header = peek.bytes;
      }

      const box = parseBoxHeader(header, 0, total);
      if (!box || !box.size || box.size < box.headerSize || offset + box.size > total) break;
      if (box.type === 'moov') {
        moov = { offset, size: box.size };
        break;
      }
      offset += box.size;
    }

    let dimensions = null;
    if (moov) {
      const length = Math.min(moov.size, MOOV_MAX_BYTES);
      // moov из первого окна — не тратим на него отдельный запрос
      const fromHead = sliceOf(head, moov.offset, length);
      if (fromHead) {
        dimensions = findVideoDimensions(fromHead);
      } else {
        const chunk = await fetchRange(url, pageUrl, moov.offset, moov.offset + length - 1, signal);
        if (chunk.from === moov.offset) dimensions = findVideoDimensions(chunk.bytes);
      }
    }

    return {
      size: total,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      codec: dimensions?.codec ?? null,
      source: 'mp4',
    };
  }

  /** HLS: разрешение и порядок размера — только если плейлист мастер-плейлист. */
  async function probeHls(url, pageUrl, signal) {
    const text = await withMediaHeaders(url, pageUrl, async () => {
      const response = await fetch(url, { credentials: 'omit', signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });

    const resolution = /RESOLUTION=(\d+)x(\d+)/i.exec(text);
    const bandwidth = /BANDWIDTH=(\d+)/i.exec(text);

    // Длительность — сумма EXTINF всех сегментов; вместе с BANDWIDTH даёт
    // прикидочный вес (битрейт × время).
    let duration = 0;
    for (const match of text.matchAll(/#EXTINF:([\d.]+)/gi)) duration += Number(match[1]);

    const size =
      bandwidth && duration ? Math.round((Number(bandwidth[1]) * duration) / 8) : null;

    return {
      size,
      width: resolution ? Number(resolution[1]) : null,
      height: resolution ? Number(resolution[2]) : null,
      codec: null,
      source: 'hls',
    };
  }

  /* ─────────────────────────────── публичное API ──────────────────────────── */

  const isMp4 = (url) => /\.mp4(\?|$)/i.test(url);
  const isM3u8 = (url) => /\.m3u8(\?|$)/i.test(url);

  let cacheLoaded = null;
  const cache = new Map();

  async function loadCache() {
    if (cacheLoaded) return cacheLoaded;
    cacheLoaded = (async () => {
      try {
        const stored = await ext?.storage?.local?.get(CACHE_KEY);
        const entries = stored?.[CACHE_KEY] ?? {};
        const now = Date.now();
        for (const [url, info] of Object.entries(entries)) {
          if (info && now - (info.at ?? 0) < CACHE_TTL_MS) cache.set(url, info);
        }
      } catch {
        // кэш — не критичная часть: не прочитался, значит просто пробуем заново
      }
      return cache;
    })();
    return cacheLoaded;
  }

  async function saveCache() {
    if (!ext?.storage?.local?.set || cache.size === 0) return;
    try {
      // Ссылки живут часами, поэтому старые записи просто не нужны.
      const entries = [...cache.entries()]
        .sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))
        .slice(0, CACHE_MAX_ENTRIES);
      await ext.storage.local.set({ [CACHE_KEY]: Object.fromEntries(entries) });
    } catch {
      // места в хранилище может не быть — молча живём дальше
    }
  }

  /**
   * Проба одной ссылки. Одновременные пробы одной и той же ссылки
   * переиспользуют общий запрос: качества часто указывают на один файл
   * («1080p Ultra» и «1080p» в списке — это одна и та же ссылка), и качать
   * его дважды незачем.
   */
  const inFlight = new Map(); // url → Promise

  function probeUrl(url, pageUrl, timeoutMs) {
    const known = inFlight.get(url);
    if (known) return known;

    const probe = isMp4(url) ? probeMp4 : isM3u8(url) ? probeHls : null;
    if (!probe) return Promise.reject(new Error('не медиафайл'));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const promise = probe(url, pageUrl, controller.signal)
      .then((info) => {
        if (!info) throw new Error('нет данных');
        return { ...info, url };
      })
      .finally(() => {
        clearTimeout(timer);
        inFlight.delete(url);
      });

    inFlight.set(url, promise);
    return promise;
  }

  /**
   * Пробует все ссылки одного качества: кто первый ответил, того и данные.
   * MP4 даёт точный вес и кадр, поэтому его пробуем до HLS — тем же порядком,
   * каким сервер выбирает файл для скачивания.
   */
  async function probeCandidates(urls, pageUrl, timeoutMs) {
    for (const group of [urls.filter(isMp4), urls.filter(isM3u8)]) {
      if (!group.length) continue;

      // Отменять проигравшие пробы не будем: они общие с другими качествами,
      // а лишние 128 КБ дешевле, чем гонки за общий запрос.
      try {
        return await Promise.any(group.map((url) => probeUrl(url, pageUrl, timeoutMs)));
      } catch {
        // все ссылки группы не ответили — пробуем следующую
      }
    }
    return null;
  }

  /**
   * @param {string[]} urls ссылки качества (mp4 и/или m3u8)
   * @param {{pageUrl?: string, timeoutMs?: number, useCache?: boolean}} options
   * @returns {Promise<{size: number|null, width: number|null, height: number|null, source: string, url: string}|null>}
   */
  async function probeQuality(urls, options = {}) {
    const { pageUrl = null, timeoutMs = DEFAULT_TIMEOUT_MS, useCache = true } = options;
    const candidates = (urls ?? []).filter(Boolean);
    if (!candidates.length) return null;

    if (useCache) {
      await loadCache();
      // Размер мог не определиться (HLS-плейлист без BANDWIDTH) — такие записи не храним.
      for (const url of candidates) {
        const cached = cache.get(url);
        if (cached?.size) return cached;
      }
    }

    const info = await probeCandidates(candidates, pageUrl, timeoutMs);
    if (info?.size && useCache) {
      cache.set(info.url, { ...info, at: Date.now() });
      saveCache();
    }
    return info;
  }

  const api = {
    probeQuality,
    // для тестов (client-extension/test/probe.test.mjs)
    findVideoDimensions,
    parseBoxHeader,
    isMp4,
    isM3u8,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();

// В попапе модуль живёт глобально (классический скрипт, без сборки).
globalThis.HdzgProbe = HdzgProbe;