/**
 * Сервис манги: разбор тайтла com-x.life/MangaDex/MangaLib и скачивание глав в
 * {Название} [{год}]/Volume N/глава/000.ext (дизайн — mango.md).
 *
 * 1 задача = 1 пачка глав (одна группа в интерфейсе), внутри — последовательно.
 * Частичная глава живёт как «<папка>.idk-part» и переименовывается только
 * целиком; существующая папка главы = глава скачана (юзер мог править
 * содержимое — не перепроверяем). История — в БД, диск — истина.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as db from '../db.js';
import { log } from '../logger.js';
import * as browser from './browser.js';
import {
  fetchImage,
  extFor,
  isMangaPageUrl,
  newsIdFromUrl,
  pagesFromReaderData,
  readerUrlFor,
} from './comx.js';
import * as mangadex from './mangadex.js';
import * as mangalib from './mangalib.js';
import {
  sanitizeName,
  parseChapterString,
  chapterFolderName,
  seriesFolderName,
  uniqueFolderName,
  pageFileName,
} from './naming.js';

/** Корень манго-библиотеки: настройка mango_dir, иначе подпапка mango в загрузках. */
export function mangoRoot(settings) {
  const configured = String(settings.mango_dir || '').trim();
  return configured || path.join(settings.download_dir, 'mango');
}

function chapterLabel(chapter) {
  return chapter.title ? `${chapter.number} - ${chapter.title}` : chapter.number;
}

function seriesKeyFor(newsId) {
  return `comx:${newsId}`;
}

/** Что уже качается по тайтлу — чтобы UI не предлагал эти главы снова. */
function activeFor(seriesKey) {
  const activeChapters = new Set();
  let active = false;
  for (const job of jobs.values()) {
    if (job.seriesKey !== seriesKey) continue;
    if (job.status !== 'running' && job.status !== 'paused') continue;
    active = true;
    for (const entry of job.chapters) {
      if (entry.status === 'queued' || entry.status === 'downloading') {
        activeChapters.add(String(entry.id));
      }
    }
  }
  return { active, activeChapters };
}

/**
 * Стабильная папка тайтла: один seriesKey → одна папка навсегда. Если на сайте
 * поменяли название — папка остаётся; если папку занял другой тайтл — суффикс.
 */
function ensureSeriesFolder(info) {
  const existing = db.getMangoSeries(info.seriesKey);
  if (existing) {
    info.folder = existing.folder;
    db.saveMangoSeries({ ...info, folder: existing.folder });
    return info;
  }

  const folder = uniqueFolderName(info.folder, (candidate) => {
    const row = db.getMangoSeriesByFolder(candidate);
    return Boolean(row && row.series_key !== info.seriesKey);
  });
  info.folder = folder;
  db.saveMangoSeries({ ...info, folder });
  return info;
}

/** Общая часть для всех источников: downloaded/pending и папка на диске. */
function finalizeInfo(info) {
  const settings = db.getSettings();
  const seriesDir = path.join(mangoRoot(settings), info.folder);
  const { active, activeChapters } = activeFor(info.seriesKey);

  const chapters = (info.chapters || []).map((chapter) => {
    const chapterDir = path.join(seriesDir, `Volume ${chapter.volume}`, chapter.folder);
    return {
      ...chapter,
      downloaded:
        db.mangoChapterDownloaded(info.seriesKey, String(chapter.id)) ||
        fs.existsSync(chapterDir),
      pending: activeChapters.has(String(chapter.id)),
    };
  });

  return { ...info, chapters, active };
}

/** ComX: страница тайтла через headless Chromium, главы из window.__DATA__. */
async function resolveComx(url) {
  const info = await browser.fetchMangaInfo(url);
  // Ссылка после редиректов может сменить зеркало — ключ тайтла по news_id.
  const resolvedUrl = info.url || url;
  const newsId = newsIdFromUrl(resolvedUrl) || newsIdFromUrl(url);
  if (!newsId) throw new Error('не удалось определить номер тайтла из ссылки');
  const seriesKey = seriesKeyFor(newsId);

  const chapters = [...info.chapters]
    .sort((a, b) => (a.posi ?? 0) - (b.posi ?? 0))
    .map((chapter) => {
      const parsed = parseChapterString(chapter.title);
      return {
        id: String(chapter.id),
        posi: chapter.posi ?? 0,
        volume: parsed.vol,
        number: parsed.num,
        title: parsed.title,
        rawTitle: String(chapter.title ?? '').trim(),
        folder: sanitizeName(chapterFolderName(parsed)),
        language: 'ru',
      };
    });

  return {
    source: 'comx',
    sourceLabel: 'com-x.life',
    seriesKey,
    url: resolvedUrl,
    newsId,
    title: sanitizeName(info.title),
    year: info.year || null,
    folder: seriesFolderName(info.title, info.year),
    language: 'ru',
    languages: [],
    chapters,
  };
}

/**
 * Ссылка → инфо о тайтле + главы с признаком «уже скачано».
 * MangaDex не открывает mangadex.org (он может быть заблокирован) — только API.
 */
export async function resolveManga(rawUrl, options = {}) {
  const url = String(rawUrl || '').trim();
  let info;

  if (mangadex.isMangaDexUrl(url)) {
    info = await mangadex.resolveMangaDex(url, { language: options.language });
  } else if (mangalib.isMangaLibUrl(url)) {
    info = await mangalib.resolveMangaLib(url);
  } else if (isMangaPageUrl(url)) {
    info = await resolveComx(url);
  } else {
    throw new Error(
      'Нужна ссылка на тайтл com-x.life (https://com-x.life/26588-nazvanie.html), ' +
        'MangaDex (https://mangadex.org/title/<uuid>/…) или ' +
        'MangaLib (https://mangalib.me/ru/manga/206--one-piece)',
    );
  }

  return finalizeInfo(ensureSeriesFolder(info));
}

/* ---------------- задания ---------------- */

const MAX_JOBS_KEPT = 20;
const jobs = new Map();
let nextJobId = 1;

function publicJob(job) {
  return {
    id: job.id,
    seriesKey: job.seriesKey,
    url: job.url,
    source: job.source,
    sourceLabel: job.sourceLabel,
    language: job.language,
    title: job.title,
    year: job.year,
    folder: job.folder,
    status: job.status,
    total: job.total,
    done: job.done,
    skipped: job.skipped,
    failed: job.failed,
    current: job.current,
    error: job.error,
    dir: job.dir,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    // По-главные статусы нужны живой карточке; завершённые отдают итоги и
    // failed, а полный список глав интерфейс догружает один раз через
    // GET /api/mango/jobs/:id (чтобы опрос раз в секунду не таскал мегабайты).
    chapters: job.status === 'running' || job.status === 'paused' ? job.chapters : undefined,
  };
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.id - a.id).map(publicJob);
}

/** Полное задание для карточки после завершения (главы + статусы). */
export function getJob(id) {
  const job = jobs.get(Number(id));
  if (!job) return null;
  return { ...publicJob(job), chapters: job.chapters };
}

export function activeJobsCount() {
  return [...jobs.values()].filter((job) => job.status === 'running').length;
}

export function cancelJob(id) {
  const job = jobs.get(Number(id));
  if (!job || (job.status !== 'running' && job.status !== 'paused')) return false;
  job.canceled = true;
  return true;
}

/** «Отменить это произведение»: все живые задания тайтла. */
export function cancelSeries(seriesKey) {
  let canceled = 0;
  for (const job of jobs.values()) {
    if ((job.status === 'running' || job.status === 'paused') && job.seriesKey === String(seriesKey)) {
      job.canceled = true;
      canceled += 1;
    }
  }
  return canceled;
}

/** Пауза: текущая страница дописывается, дальше задание стоит и ждёт resume. */
export function pauseSeries(seriesKey) {
  let paused = 0;
  for (const job of jobs.values()) {
    if (job.status === 'running' && job.seriesKey === String(seriesKey)) {
      job.status = 'paused';
      paused += 1;
    }
  }
  return paused;
}

export function resumeSeries(seriesKey) {
  let resumed = 0;
  for (const job of jobs.values()) {
    if (job.status === 'paused' && job.seriesKey === String(seriesKey)) {
      job.status = 'running';
      resumed += 1;
    }
  }
  return resumed;
}

/**
 * Удаляет скачанное произведение: останавливает задания, ждёт их, убирает
 * папки Volume N и историю в БД. Cover.png и прочие файлы юзера в папке
 * тайтла не трогает — это его контент.
 */
export async function deleteSeries(seriesKey) {
  const key = String(seriesKey);
  const seriesJobs = [...jobs.values()].filter((job) => job.seriesKey === key);
  for (const job of seriesJobs) {
    if (job.status === 'running' || job.status === 'paused') job.canceled = true;
  }
  await Promise.allSettled(seriesJobs.map((job) => job.promise).filter(Boolean));

  const stored = db.getMangoSeries(key);
  let dir = stored ? path.join(mangoRoot(db.getSettings()), stored.folder) : null;
  if (!dir) dir = seriesJobs.find((job) => job.dir)?.dir || null;
  if (!dir) {
    const rows = db.listMangoChapters(key);
    if (rows.length) {
      dir = path.join(mangoRoot(db.getSettings()), seriesFolderName(rows[0].series_title, rows[0].year));
    }
  }

  let deletedVolumes = 0;
  if (dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory() && /^Volume\b/i.test(entry.name)) {
        await fsp.rm(path.join(dir, entry.name), { recursive: true, force: true });
        deletedVolumes += 1;
      }
    }
    // Пустую папку тайтла убираем; если в ней остался Cover.png юзера — оставляем.
    await fsp.rmdir(dir).catch(() => {});
  }
  db.deleteMangoChapters(key);
  db.deleteMangoSeries(key);
  for (const job of seriesJobs) jobs.delete(job.id);
  log.info(`манга: удалено произведение ${key} — томов: ${deletedVolumes}`);
  return { deleted: deletedVolumes, dir };
}

/** Удаляет один том: папку Volume N и его записи в истории. */
export async function deleteVolume(seriesKey, volume) {
  const key = String(seriesKey);
  const volumeStr = String(volume);
  const busy = [...jobs.values()].some(
    (job) =>
      job.seriesKey === key && (job.status === 'running' || job.status === 'paused'),
  );
  if (busy) throw new Error('Сначала остановите загрузку произведения');

  const rows = db.listMangoChapters(key);
  const stored = db.getMangoSeries(key);
  let dir = stored ? path.join(mangoRoot(db.getSettings()), stored.folder) : null;
  if (!dir) dir = [...jobs.values()].find((job) => job.seriesKey === key && job.dir)?.dir || null;
  if (!dir && rows.length) {
    dir = path.join(mangoRoot(db.getSettings()), seriesFolderName(rows[0].series_title, rows[0].year));
  }

  if (dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    const wanted = `volume ${volumeStr}`.toLowerCase();
    const match = entries.find(
      (entry) => entry.isDirectory() && entry.name.toLowerCase() === wanted,
    );
    if (match) await fsp.rm(path.join(dir, match.name), { recursive: true, force: true });
  }

  const removed = db.deleteMangoVolume(key, volumeStr);
  // Если после удаления тома папка тайтла опустела — убираем и её
  // (Cover.png и прочие файлы юзера не дадут ей удалиться).
  if (dir) await fsp.rmdir(dir).catch(() => {});
  // В завершённых заданиях помечаем главы этого тома удалёнными.
  for (const job of jobs.values()) {
    if (job.seriesKey !== key) continue;
    for (const entry of job.chapters) {
      if (String(entry.volume) === volumeStr && entry.status !== 'queued') {
        entry.status = 'deleted';
      }
    }
  }
  log.info(`манга: удалён том ${volumeStr} (${key}), записей: ${removed}`);
  return { deleted: removed, volume: volumeStr };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Стоим, пока задание на паузе (или не отменили). */
async function waitIfPaused(job) {
  while (job.status === 'paused' && !job.canceled) await sleep(300);
}

class CanceledError extends Error {
  constructor() {
    super('отменено');
  }
}

async function removeDir(dir) {
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
}

async function comxImages(info, chapter) {
  const readerUrl = readerUrlFor(info.newsId, chapter.id);
  const reader = await browser.fetchReaderInfo(readerUrl);
  const pages = pagesFromReaderData(reader);
  if (!pages.images.length) throw new Error('на странице главы не нашлось картинок');
  return {
    source: 'comx',
    referer: readerUrl,
    hosts: pages.hosts,
    images: pages.images,
  };
}

async function downloadChapter(job, info, chapter, seriesDir) {
  const entry = job.chapters.find((item) => item.id === chapter.id) || null;
  const chapterDir = path.join(seriesDir, `Volume ${chapter.volume}`, chapter.folder);
  if (fs.existsSync(chapterDir)) {
    job.skipped += 1;
    if (entry) entry.status = 'skipped';
    return;
  }

  let imageSet;
  if (info.source === 'mangadex') {
    imageSet = await mangadex.chapterImages(chapter);
  } else if (info.source === 'mangalib') {
    imageSet = await mangalib.chapterImages(chapter);
  } else {
    imageSet = await comxImages(info, chapter);
  }
  if (!imageSet.images.length) throw new Error('у главы нет страниц');

  if (job.current) job.current.pagesTotal = imageSet.images.length;
  if (entry) entry.pagesTotal = imageSet.images.length;

  const tmpDir = chapterDir + '.idk-part';
  await fsp.mkdir(tmpDir, { recursive: true });

  try {
    for (let index = 0; index < imageSet.images.length; index++) {
      if (job.canceled) throw new CanceledError();
      await waitIfPaused(job);
      if (job.canceled) throw new CanceledError();

      let image;
      if (info.source === 'mangadex') {
        try {
          image = await mangadex.fetchImage(imageSet, index);
        } catch (error) {
          if (error.code !== 'at-home-expired') throw error;
          // at-home URL живёт ~15 минут; перезапрашиваем и пробуем ту же страницу.
          imageSet = await mangadex.chapterImages(chapter);
          image = await mangadex.fetchImage(imageSet, index);
        }
      } else if (info.source === 'mangalib') {
        image = await mangalib.fetchImage(imageSet, index);
      } else {
        const page = imageSet.images[index];
        image = await fetchImage(page, imageSet.hosts, imageSet.referer);
      }

      const fallbackExt = imageSet.images[index]?.extFromUrl;
      const name = pageFileName(
        index,
        imageSet.images.length,
        extFor(image.contentType, fallbackExt),
      );
      await fsp.writeFile(path.join(tmpDir, name), image.buffer);
      job.current.pagesDone = index + 1;
      if (entry) entry.pagesDone = index + 1;
    }

    await fsp.rename(tmpDir, chapterDir);
    if (entry) entry.status = 'done';
    db.addMangoChapter({
      seriesKey: info.seriesKey,
      seriesUrl: info.url,
      seriesTitle: info.title,
      year: info.year,
      chapterId: chapter.id,
      volume: chapter.volume,
      number: chapter.number,
      title: chapter.title,
      folder: chapter.folder,
      pages: imageSet.images.length,
      source: info.source,
      language: chapter.language || info.language,
      groupName: chapter.group || null,
      chapterUrl: chapter.url || null,
      external: chapter.external ? 1 : 0,
    });
  } catch (error) {
    await removeDir(tmpDir);
    throw error;
  }
}

async function runJob(job, info, chapters) {
  const settings = db.getSettings();
  const seriesDir = path.join(mangoRoot(settings), info.folder);
  try {
    await fsp.mkdir(seriesDir, { recursive: true });
    for (const chapter of chapters) {
      if (job.canceled) break;
      await waitIfPaused(job);
      if (job.canceled) break;
      const entry = job.chapters.find((item) => item.id === chapter.id) || null;
      if (entry) entry.status = 'downloading';
      job.current = {
        id: chapter.id,
        label: chapterLabel(chapter),
        pagesDone: 0,
        pagesTotal: 0,
      };
      try {
        await downloadChapter(job, info, chapter, seriesDir);
        job.done += 1;
      } catch (error) {
        if (error instanceof CanceledError || job.canceled) break;
        job.failed.push({ id: chapter.id, label: chapterLabel(chapter), error: error.message });
        if (entry) {
          entry.status = 'failed';
          entry.error = error.message;
        }
        log.warn(`манга: глава «${chapterLabel(chapter)}» не скачалась: ${error.message}`);
      }
    }
    job.status = job.canceled ? 'canceled' : 'done';
  } catch (error) {
    job.status = 'error';
    job.error = error.message;
    log.error(`манга: задание «${info.title}» упало: ${error.message}`);
  } finally {
    job.current = null;
    job.finishedAt = Date.now();
    if (job.status === 'canceled') {
      for (const entry of job.chapters) {
        if (entry.status === 'queued' || entry.status === 'downloading') entry.status = 'canceled';
      }
    }
    // Старые завершённые задания не копим в памяти.
    const finished = [...jobs.values()]
      .filter((entry) => entry.status !== 'running')
      .sort((a, b) => a.id - b.id);
    while (jobs.size > MAX_JOBS_KEPT && finished.length) {
      const oldest = finished.shift();
      jobs.delete(oldest.id);
    }
    const summary =
      `манга: «${info.title}» — скачано ${job.done}, пропущено ${job.skipped}, ` +
      `провалено ${job.failed.length} (${job.status})`;
    if (job.failed.length) log.warn(summary);
    else log.info(summary);
  }
}

/**
 * Создаёт задание на скачивание. Возвращает:
 *   { job, alreadyDownloaded, total, info } — job === null, если качать нечего
 *   (всё выбранное уже скачано — интерфейс показывает предупреждение).
 */
export async function createDownload(rawUrl, chapterIds = [], options = {}) {
  const info = await resolveManga(rawUrl, options);

  // Защита от второго «Добавить» по тому же тайтлу: пока живое задание есть,
  // новое не создаём (иначе на каждый клик появляется вторая карточка).
  const activeNow = [...jobs.values()].some(
    (job) =>
      job.seriesKey === info.seriesKey &&
      (job.status === 'running' || job.status === 'paused'),
  );
  if (activeNow) {
    throw new Error(
      'Это произведение уже качается — дождитесь окончания или отмените задание',
    );
  }

  const wantedIds = new Set(
    (Array.isArray(chapterIds) ? chapterIds : []).map((id) => String(id)),
  );
  const selected = wantedIds.size
    ? info.chapters.filter((chapter) => wantedIds.has(chapter.id))
    : info.chapters;
  if (!selected.length) throw new Error('выбранные главы не найдены на странице тайтла');

  // External/unavailable нельзя скачать; API мог прислать их в обход UI.
  const wanted = selected.filter((chapter) => !chapter.external && !chapter.unavailable);
  if (!wanted.length) {
    throw new Error('выбранные главы недоступны для скачивания (external/недоступные)');
  }

  const alreadyDownloaded = wanted.filter((chapter) => chapter.downloaded).length;
  const toDownload = wanted.filter((chapter) => !chapter.downloaded);

  const brief = {
    url: info.url,
    source: info.source,
    sourceLabel: info.sourceLabel,
    language: info.language,
    title: info.title,
    year: info.year,
    folder: info.folder,
  };

  if (!toDownload.length) {
    return { job: null, alreadyDownloaded, total: wanted.length, info: brief };
  }

  const job = {
    id: nextJobId++,
    seriesKey: info.seriesKey,
    url: info.url,
    source: info.source,
    sourceLabel: info.sourceLabel,
    language: info.language,
    title: info.title,
    year: info.year,
    folder: info.folder,
    status: 'running',
    total: toDownload.length,
    done: 0,
    skipped: 0,
    failed: [],
    current: null,
    error: null,
    dir: path.join(mangoRoot(db.getSettings()), info.folder),
    startedAt: Date.now(),
    finishedAt: null,
    canceled: false,
    promise: null,
    chapters: toDownload.map((chapter) => ({
      id: chapter.id,
      label: chapterLabel(chapter),
      volume: chapter.volume,
      number: chapter.number,
      title: chapter.title,
      language: chapter.language || info.language,
      group: chapter.group || null,
      status: 'queued',
      pagesDone: 0,
      pagesTotal: 0,
      error: null,
    })),
  };
  jobs.set(job.id, job);
  log.info(`манга: «${info.title}» — в очередь ${toDownload.length} глав`);

  // Не ждём: задание живёт в фоне, прогресс отдаётся через /api/mango/jobs.
  // promise нужен удалению произведения: оно сначала останавливает задание,
  // потом дожидается его остановки и только затем трогает папки.
  job.promise = runJob(job, info, toDownload);

  return { job: publicJob(job), alreadyDownloaded, total: wanted.length, info: brief };
}

/** Аккуратная остановка: отменяем задания и гасим Chromium. */
export async function shutdown() {
  for (const job of jobs.values()) {
    if (job.status === 'running') job.canceled = true;
  }
  await browser.close();
}
