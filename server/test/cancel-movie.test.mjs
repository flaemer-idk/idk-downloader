import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Папку загрузок и базу задаём до импорта модулей: config читает окружение при
// импорте, поэтому тест живёт на своей временной папке и ничего не ломает в рабочей.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idk-cancel-'));
const downloads = path.join(tmpDir, 'downloads');
fs.mkdirSync(downloads, { recursive: true });
process.env.DB_FILE = path.join(tmpDir, 'grabber.db');
process.env.DOWNLOAD_DIR = downloads;

const db = await import('../src/db.js');
const downloader = await import('../src/downloader.js');

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

/** Задача серии: как её создаёт сервер, плюс .part-файл незаконченной загрузки. */
function makeTask(movieId, { status = 'queued', episode = '1', withPart = false } = {}) {
  const filename = `Фильм (2020)/Season 1/S01E${episode}.mp4`;
  const row = db.createTask({
    url: `https://cdn.example/e${episode}.mp4`,
    filename,
    movie_id: movieId,
    title: 'Фильм',
    season: '1',
    episode,
    total_bytes: 1024 ** 3,
  });
  db.updateTask(row.id, { status });

  let partPath = null;
  if (withPart) {
    partPath = path.join(downloads, `${filename}.${row.id}.part`);
    fs.mkdirSync(path.dirname(partPath), { recursive: true });
    fs.writeFileSync(partPath, 'недокачанная часть');
  }
  return { ...db.getTask(row.id), partPath };
}

test('cancelMovie отменяет только незаконченные задачи своего фильма', async () => {
  const downloading = makeTask('55', { status: 'downloading', episode: '1', withPart: true });
  const queued = makeTask('55', { status: 'queued', episode: '2' });
  const paused = makeTask('55', { status: 'paused', episode: '3' });
  const done = makeTask('55', { status: 'done', episode: '4' });
  const error = makeTask('55', { status: 'error', episode: '5' });
  const other = makeTask('56', { status: 'downloading', episode: '1' });

  assert.equal(await downloader.cancelMovie('55'), 3);

  assert.equal(db.getTask(downloading.id).status, 'canceled');
  assert.equal(db.getTask(queued.id).status, 'canceled');
  assert.equal(db.getTask(paused.id).status, 'canceled');
  // Готовое и сбойное — уже история: их отмена только запутала бы (у сбойной
  // есть кнопка «Повторить», у готовой — файл на диске).
  assert.equal(db.getTask(done.id).status, 'done');
  assert.equal(db.getTask(error.id).status, 'error');
  // У фильма с другим movie_id свои задачи — их не трогаем.
  assert.equal(db.getTask(other.id).status, 'downloading');

  // .part отменённой загрузки убран, чтобы не занимал место.
  assert.equal(fs.existsSync(downloading.partPath), false);
});

test('cancelMovie на фильме без задач ничего не отменяет', async () => {
  assert.equal(await downloader.cancelMovie('нет-такого-фильма'), 0);
});

test('сводка по фильму показывает итог отмены', async () => {
  const summary = db.movieSummary('55');
  assert.equal(summary.downloading, 0);
  assert.equal(summary.queued, 0);
  assert.equal(summary.paused, 0);
  assert.equal(summary.canceled, 3);
  assert.equal(summary.done, 1);
  assert.equal(summary.error, 1);
});