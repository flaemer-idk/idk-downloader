/**
 * Тесты пробы медиафайла (client-extension/media-probe.js).
 *
 * Запуск:  node client-extension/test/probe.test.mjs
 * Нужен ffmpeg (генерирует фикстуры) — без него тесты генерации пропускаются.
 *
 * Проверяем то, что легко сломать и трудно заметить в браузере: разбор
 * MP4-боксов (moov в начале и в конце файла, аудиодорожка впереди видео,
 * HEVC, портретное видео) и выбор ссылки при пробах (mp4 → m3u8, битые ссылки).
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const probe = require('../media-probe.js');

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

const dir = mkdtempSync(join(tmpdir(), 'idk-probe-'));

function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function makeVideo(file, { size, extra = [], audioFirst = false }) {
  const common = ['-f', 'lavfi', '-i', `testsrc=size=${size}:rate=1:duration=2`,
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2'];
  const maps = audioFirst ? ['-map', '1:a', '-map', '0:v'] : [];
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...common, ...maps,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    ...extra, join(dir, file),
  ]);
}

/* ─────────────────────────── 1. Разбор файла напрямую ────────────────────── */

console.log('Разбор MP4-боксов (без сети)');

// Размер крупной фикстуры нужен и в сетевых тестах ниже.
let bigSize = 0;

if (!hasFfmpeg()) {
  console.log('  пропуск: ffmpeg не найден');
} else {
  const fixtures = [
    ['v1080.mp4', { size: '1920x1080', extra: [] }],
    ['v720-fast.mp4', { size: '1280x720', extra: ['-movflags', '+faststart'] }],
    ['v480.mp4', { size: '854x480', extra: [] }],
    ['v432x768.mp4', { size: '432x768', extra: [] }], // «портрет» — как 429×729 у hdrezka
    ['v360-audio-first.mp4', { size: '640x360', extra: [], audioFirst: true }],
  ];
  for (const [file, options] of fixtures) makeVideo(file, options);

  const expectations = {
    // [ширина, высота, лежит ли moov в конце файла (без +faststart)]
    'v1080.mp4': [1920, 1080, true],
    'v720-fast.mp4': [1280, 720, false],
    'v480.mp4': [854, 480, true],
    'v432x768.mp4': [432, 768, true],
    'v360-audio-first.mp4': [640, 360, true],
  };

  for (const [file, [width, height, moovAtEnd]] of Object.entries(expectations)) {
    const buffer = new Uint8Array(readFileSync(join(dir, file)));
    const dims = probe.findVideoDimensions(buffer);
    check(`${file}: ${width}x${height}`, [dims?.width, dims?.height], [width, height]);

    // moov в конце — значит stsd должен находиться и по одному хвосту файла,
    // без скачивания всего остального.
    if (moovAtEnd) {
      const tail = buffer.subarray(buffer.length - 4096);
      check(`${file}: кадр находится по хвосту файла`, probe.findVideoDimensions(tail)?.width ?? null, width);
    }
  }

  // HEVC — если сборка ffmpeg умеет libx265.
  try {
    makeVideo('v1080-hevc.mp4', { size: '1920x1080', extra: ['-c:v', 'libx265', '-tag:v', 'hvc1'] });
    const dims = probe.findVideoDimensions(new Uint8Array(readFileSync(join(dir, 'v1080-hevc.mp4'))));
    check('v1080-hevc.mp4: 1920x1080 (hvc1)', [dims?.width, dims?.height], [1920, 1080]);
  } catch {
    console.log('  пропуск: libx265 недоступен');
  }

  // Файл заметно больше первого окна (128 КБ) и с moov в конце: размер должен
  // определиться, кадр — только если сервер честно отвечает на Range.
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=25:duration=8',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-b:v', '3M',
    join(dir, 'v1080-big.mp4'),
  ]);
  bigSize = readFileSync(join(dir, 'v1080-big.mp4')).length;
  check('v1080-big.mp4 больше окна пробы', bigSize > 128 * 1024, true);
}

/* ─────────────────────────────── 2. Проба по HTTP ────────────────────────── */

const m3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
index.m3u8
#EXTINF:10.0,
seg1.ts
#EXTINF:10.0,
seg2.ts
#EXTINF:80.0,
seg3.ts
`;

function makeServer({ ignoreRange = false, onRequest = null } = {}) {
  return createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    onRequest?.(path);
    if (path === '/master.m3u8') {
      response.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      response.end(m3u8);
      return;
    }

    let body;
    try {
      body = readFileSync(join(dir, path.slice(1)));
    } catch {
      response.writeHead(404, { 'Content-Length': '0' });
      response.end();
      return;
    }

    const range = ignoreRange ? null : /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      response.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${body.length}`,
        'Content-Length': String(end - start + 1),
      });
      response.end(body.subarray(start, end + 1));
    } else {
      response.writeHead(200, { 'Content-Length': String(body.length) });
      response.end(body);
    }
  });
}

async function withServer(options, run) {
  const server = makeServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/** Сколько раз дёрнули каждый путь — для проверки дедупликации проб. */
const requests = new Map();

console.log('\nПроба по HTTP');

if (hasFfmpeg()) {
  await withServer({}, async (base) => {
    const cases = [
      ['v1080.mp4', 1920, 1080],
      ['v720-fast.mp4', 1280, 720],
      ['v360-audio-first.mp4', 640, 360],
    ];
    for (const [file, width, height] of cases) {
      const size = readFileSync(join(dir, file)).length;
      const info = await probe.probeQuality([`${base}/${file}`], { pageUrl: base, useCache: false });
      check(`${file}: вес и кадр`, [info?.size, info?.width, info?.height], [size, width, height]);
    }
  });
} else {
  console.log('  пропуск сетевых тестов: нет фикстур');
}

await withServer({}, async (base) => {
  const info = await probe.probeQuality([`${base}/master.m3u8`], { pageUrl: base, useCache: false });
  // BANDWIDTH=5 Мбит/с, сумма EXTINF = 100 с → ≈ 62.5e6 байт
  check('m3u8: разрешение и прикидка веса', [info?.width, info?.height, info?.size], [1920, 1080, 62500000]);
});

await withServer({}, async (base) => {
  const info = await probe.probeQuality(
    [`${base}/missing.mp4`, `${base}/v1080.mp4`],
    { pageUrl: base, useCache: false },
  );
  check('битая mp4 + живая mp4: берём живую', [info?.width, info?.height], [1920, 1080]);
});

await withServer({}, async (base) => {
  const info = await probe.probeQuality(
    [`${base}/missing.mp4`, `${base}/master.m3u8`],
    { pageUrl: base, useCache: false },
  );
  check('все mp4 битые → откат на m3u8', [info?.source, info?.height], ['hls', 1080]);
});

await withServer({}, async (base) => {
  const info = await probe.probeQuality([`${base}/missing.mp4`], { pageUrl: base, useCache: false });
  check('всё битое → null', info, null);
});

// «1080p» и «1080p Ultra» часто ссылаются на один файл: проба должна быть одна.
await withServer(
  { onRequest: (path) => requests.set(path, (requests.get(path) ?? 0) + 1) },
  async (base) => {
    const url = `${base}/v1080.mp4`;
    const [first, second] = await Promise.all([
      probe.probeQuality([url], { pageUrl: base, useCache: false }),
      probe.probeQuality([url], { pageUrl: base, useCache: false }),
    ]);
    check(
      'общая ссылка у двух качеств: один запрос на двоих',
      [first?.width, second?.width, requests.get('/v1080.mp4')],
      [1920, 1920, 1],
    );
  },
);

if (hasFfmpeg()) {
  await withServer({}, async (base) => {
    // moov за пределами первого окна: проба должна «дойти» до него по размерам
    const info = await probe.probeQuality([`${base}/v1080-big.mp4`], { pageUrl: base, useCache: false });
    check('большой файл с moov в конце: вес и кадр', [info?.size, info?.width, info?.height], [bigSize, 1920, 1080]);
  });

  await withServer({ ignoreRange: true }, async (base) => {
    const fastSize = readFileSync(join(dir, 'v720-fast.mp4')).length;
    const fast = await probe.probeQuality([`${base}/v720-fast.mp4`], { pageUrl: base, useCache: false });
    check('сервер игнорирует Range: вес и кадр из шапки', [fast?.size, fast?.width], [fastSize, 1280]);

    // moov в конце и файл больше окна: кадр узнать неоткуда — показываем вес без кадра
    const late = await probe.probeQuality([`${base}/v1080-big.mp4`], { pageUrl: base, useCache: false });
    check('сервер игнорирует Range, moov в конце: вес есть, кадр неизвестен', [late?.size, late?.width], [bigSize, null]);
  });
}

/* ────────────────────────────── 3. Мелкие утилиты ────────────────────────── */

console.log('\nУтилиты');
check('isMp4 с query', [probe.isMp4('https://x/a.mp4?token=1'), probe.isMp4('https://x/a.mp4')], [true, true]);
check('isMp4 не ловит m3u8', probe.isMp4('https://x/a.m3u8'), false);
check('parseBoxHeader: обычный бокс', probe.parseBoxHeader(new Uint8Array([0, 0, 1, 0, 0x66, 0x74, 0x79, 0x70]), 0, 256), { type: 'ftyp', size: 256, headerSize: 8 });
check('parseBoxHeader: пусто', probe.parseBoxHeader(new Uint8Array([0, 0]), 0, 256), null);

console.log(`\nИтог: ${passed} ok, ${failed} FAIL`);
process.exit(failed ? 1 : 0);