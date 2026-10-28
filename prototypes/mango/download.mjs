// Пайплайн mango для прототипа: ComX → папки по mango.md.
//
//   node prototypes/mango/download.mjs <url тайтла> [опции]
//
// Опции:
//   --out DIR          корень манго-библиотеки (по умолчанию ./out рядом)
//   --cookies FILE     cookies в Netscape-формате (по умолчанию cookies.txt рядом)
//   --chapters LIST    какие главы: «1,2.5,8-10» по номеру главы; по умолчанию все
//   --info FILE        JSON со страниц тайтла (режим «как будет с расширением»),
//                      вместо загрузки страницы сервером
//   --reader-cache DIR где искать reader-{id}.json с данными читалки (там же по умолчанию)
//   --list             только показать главы и выйти
//
// Правила — prototypes/mango/mango.md: {Название} [{год}]/Volume N/глава/000.ext,
// расширение из Content-Type, .idk-part до готовности, скип существующих папок.

import { readdir, rename, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCookieFile,
  getMangaInfo,
  getChapterPages,
  fetchImage,
  extFor,
  sanitizeName,
  mangaInfoFromJson,
} from './comx.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    out: resolve(HERE, 'out'),
    cookies: resolve(HERE, 'cookies.txt'),
    chapters: null,
    list: false,
    info: null,
    readerCache: HERE,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = resolve(argv[++i]);
    else if (a === '--cookies') args.cookies = resolve(argv[++i]);
    else if (a === '--chapters') args.chapters = argv[++i];
    else if (a === '--list') args.list = true;
    else if (a === '--info') args.info = resolve(argv[++i]);
    else if (a === '--reader-cache') args.readerCache = resolve(argv[++i]);
    else rest.push(a);
  }
  return { ...args, url: rest[0] };
}

// «1,2.5,8-10» → предикат по номеру главы
function chapterFilter(spec) {
  if (!spec) return () => true;
  const wanted = [];
  for (const part of spec.split(',')) {
    const range = part.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    if (range) wanted.push({ from: Number(range[1]), to: Number(range[2]) });
    else wanted.push({ exact: Number(part) });
  }
  return (num) => {
    const n = Number(num);
    if (!Number.isFinite(n)) return false;
    return wanted.some((w) =>
      w.exact !== undefined ? n === w.exact : n >= w.from && n <= w.to
    );
  };
}

async function existingDirs(dir) {
  if (!existsSync(dir)) return new Set();
  return new Set(await readdir(dir));
}

async function downloadChapter(chapter, pages, chapterDir, jar) {
  const tmpDir = resolve(chapterDir + '.idk-part');
  await mkdir(tmpDir, { recursive: true });
  try {
    const width = pages.images.length >= 1000 ? 4 : 3;
    for (let i = 0; i < pages.images.length; i++) {
      const page = pages.images[i];
      const { buffer, contentType } = await fetchImage(page, pages.hosts, pages.readerUrl, jar);
      const name = String(i).padStart(width, '0') + extFor(contentType, page.extFromUrl);
      await writeFile(join(tmpDir, name), buffer);
      process.stdout.write(`\r    ${i + 1}/${pages.images.length}`);
    }
    process.stdout.write('\n');
    await rename(tmpDir, chapterDir);
    return pages.images.length;
  } catch (e) {
    console.error(`    ✗ глава провалилась (${e.message}), временная папка удалена`);
    await rm(tmpDir, { recursive: true, force: true });
    throw e;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('Использование: node download.mjs <url тайтла> [--chapters 1,2.5,8-10] [--out DIR] [--cookies FILE] [--list]');
    process.exit(1);
  }

  const jar = loadCookieFile(await import('node:fs/promises').then((m) => m.readFile(args.cookies, 'utf8')));

  let manga;
  if (args.info) {
    console.log(`→ инфо тайтла из файла (режим расширения): ${args.info}`);
    const info = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(args.info, 'utf8')));
    manga = mangaInfoFromJson(info);
  } else {
    console.log(`→ читаю страницу тайтла: ${args.url}`);
    manga = await getMangaInfo(args.url, jar);
  }
  const seriesName = manga.year ? `${manga.title} [${manga.year}]` : manga.title;
  console.log(`  тайтл: ${manga.title}${manga.year ? ` (${manga.year})` : ''}`);
  console.log(`  глав: ${manga.chapters.length}`);

  if (args.list) {
    for (const c of manga.chapters) {
      console.log(`  [posi] №${c.num}${c.title ? ` - ${c.title}` : ''}  (том ${c.vol}, id ${c.id}) «${c.rawTitle}»`);
    }
    return;
  }

  const filter = chapterFilter(args.chapters);
  const selected = manga.chapters.filter((c) => filter(c.num));
  if (!selected.length) {
    console.log('  выбранные главы не найдены — нечего качать');
    return;
  }

  const seriesDir = join(args.out, seriesName);
  await mkdir(seriesDir, { recursive: true });

  let done = 0;
  let skipped = 0;
  const failed = [];

  for (const chapter of selected) {
    const folderName = chapter.title ? `${chapter.num} - ${chapter.title}` : chapter.num;
    const chapterDir = join(seriesDir, `Volume ${chapter.vol}`, sanitizeName(folderName));

    if (existsSync(chapterDir)) {
      console.log(`  ⊘ ${chapter.num}${chapter.title ? ` - ${chapter.title}` : ''} (уже есть)`);
      skipped++;
      continue;
    }

    console.log(`  ↓ глава ${chapter.num}${chapter.title ? ` - ${chapter.title}` : ''}`);
    try {
      const pages = await getChapterPages(chapter, manga, jar, { readerCacheDir: args.readerCache });
      await downloadChapter(chapter, pages, chapterDir, jar);
      done++;
    } catch {
      failed.push(chapter);
    }
  }

  console.log(`\nготово: скачано ${done}, пропущено ${skipped}, провалено ${failed.length}`);
  if (failed.length) {
    console.log('  провалы: ' + failed.map((c) => `№${c.num}`).join(', '));
  }
}

main().catch((e) => {
  console.error('ошибка:', e.message);
  process.exit(1);
});
