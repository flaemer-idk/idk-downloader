import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Конфиг читает переменные окружения при импорте, поэтому DB_FILE ставим
// до первого import — тесты работают на своей временной базе, не на рабочей.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idk-db-'));
process.env.DB_FILE = path.join(tmpDir, 'grabber.db');

// «Старая» база: всё как в прошлой версии, то есть без колонок из миграций
// (year, subtitle_lang_code, queue_hidden, real_width, real_height).
const oldDb = new DatabaseSync(process.env.DB_FILE);
oldDb.exec(`
  CREATE TABLE tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    status          TEXT    NOT NULL DEFAULT 'queued',
    url             TEXT    NOT NULL,
    alt_urls        TEXT    NOT NULL DEFAULT '[]',
    filename        TEXT,
    referer         TEXT,
    group_key       TEXT,
    movie_id        TEXT,
    title           TEXT,
    orig_title      TEXT,
    quality         TEXT,
    voiceover       TEXT,
    season          TEXT,
    season_title    TEXT,
    episode         TEXT,
    episode_title   TEXT,
    file_type       TEXT    NOT NULL DEFAULT 'video',
    subtitle_lang   TEXT,
    total_bytes     INTEGER NOT NULL DEFAULT 0,
    received_bytes  INTEGER NOT NULL DEFAULT 0,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    file_path       TEXT,
    created_at      INTEGER NOT NULL,
    started_at      INTEGER,
    finished_at     INTEGER
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE mango_chapters (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    series_key   TEXT    NOT NULL,
    series_url   TEXT    NOT NULL,
    series_title TEXT,
    year         TEXT,
    chapter_id   TEXT    NOT NULL,
    volume       TEXT,
    number       TEXT,
    title        TEXT,
    folder       TEXT,
    pages        INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    UNIQUE(series_key, chapter_id)
  );
`);
oldDb
  .prepare(
    `INSERT INTO tasks (status, url, movie_id, title, file_type, total_bytes, received_bytes, created_at)
     VALUES ('done', 'https://cdn.example/a.mp4', '7', 'Старый фильм', 'video', 1073741824, 1073741824, 1)`,
  )
  .run();
oldDb.close();

const { prepareTask } = await import('../src/tasks.js');
const db = await import('../src/db.js');

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

test('миграция добавляет real_width/real_height в старую базу', () => {
  const task = db.getTask(1); // открывает базу и прогоняет миграции
  assert.ok(task);
  assert.equal(task.title, 'Старый фильм');

  const check = new DatabaseSync(process.env.DB_FILE);
  const columns = check.prepare('PRAGMA table_info(tasks)').all().map((row) => row.name);
  check.close();
  for (const name of ['real_width', 'real_height', 'year', 'subtitle_lang_code', 'queue_hidden']) {
    assert.ok(columns.includes(name), `нет колонки ${name}`);
  }
  assert.equal(task.real_width, null);
  assert.equal(task.real_height, null);
});

test('миграция mango_chapters добавляет source/language/group/url', () => {
  db.addMangoChapter({
    seriesKey: 'mangadex:test',
    seriesUrl: 'https://mangadex.org/title/test',
    seriesTitle: 'Тест',
    year: '2020',
    chapterId: 'ch-1',
    volume: '1',
    number: '1',
    title: 'Глава',
    folder: '1 - Глава [en]',
    pages: 5,
    source: 'mangadex',
    language: 'en',
    groupName: 'Group',
    chapterUrl: 'https://mangadex.org/chapter/ch-1',
    external: false,
  });

  const row = db.listRecentMango(1)[0];
  assert.equal(row.source, 'mangadex');
  assert.equal(row.language, 'en');
  assert.equal(row.group_name, 'Group');
  assert.equal(row.chapter_url, 'https://mangadex.org/chapter/ch-1');
  assert.equal(row.is_external, 0);

  const check = new DatabaseSync(process.env.DB_FILE);
  const columns = check
    .prepare('PRAGMA table_info(mango_chapters)')
    .all()
    .map((item) => item.name);
  check.close();
  for (const name of ['source', 'language', 'group_name', 'chapter_url', 'is_external']) {
    assert.ok(columns.includes(name), `нет колонки ${name}`);
  }
});

test('mango_series: папка не меняется при переименовании, записи не смешиваются', () => {
  const first = db.saveMangoSeries({
    seriesKey: 'mangadex:series-1',
    source: 'mangadex',
    url: 'https://mangadex.org/title/series-1',
    title: 'Старое название',
    year: '2020',
    folder: 'Старое название [2020]',
  });
  assert.equal(first.folder, 'Старое название [2020]');
  assert.equal(db.getMangoSeriesByFolder('Старое название [2020]').series_key, 'mangadex:series-1');

  db.saveMangoSeries({
    seriesKey: 'mangadex:series-1',
    source: 'mangadex',
    url: 'https://mangadex.org/title/series-1',
    title: 'Новое название',
    year: '2020',
    folder: 'Новое название [2020]',
  });
  const afterRename = db.getMangoSeries('mangadex:series-1');
  assert.equal(afterRename.title, 'Новое название');
  assert.equal(afterRename.folder, 'Старое название [2020]');

  db.saveMangoSeries({
    seriesKey: 'comx:series-2',
    source: 'comx',
    url: 'https://com-x.life/2-title.html',
    title: 'Другой тайтл',
    year: '2020',
    folder: 'Другой тайтл [2020]',
  });
  assert.equal(db.getMangoSeries('comx:series-2').folder, 'Другой тайтл [2020]');

  db.deleteMangoSeries('mangadex:series-1');
  assert.equal(db.getMangoSeries('mangadex:series-1'), null);
});

test('prepareTask принимает реальное разрешение и чистит мусор', () => {
  const full = prepareTask({
    url: 'https://cdn.example/movie.mp4',
    title: 'Фильм',
    total_bytes: 123,
    real_width: 1280,
    real_height: 720,
  });
  assert.equal(full.real_width, 1280);
  assert.equal(full.real_height, 720);

  const camel = prepareTask({
    url: 'https://cdn.example/movie.mp4',
    title: 'Фильм',
    realWidth: 1920,
    realHeight: 1080,
  });
  assert.equal(camel.real_width, 1920);
  assert.equal(camel.real_height, 1080);

  const empty = prepareTask({ url: 'https://cdn.example/movie.mp4', real_width: 'abc' });
  assert.equal(empty.real_width, null);
  assert.equal(empty.real_height, null);
});

test('разрешение доезжает до базы и до API-сериализации', () => {
  const input = prepareTask({
    url: 'https://cdn.example/series.mkv.mp4',
    title: 'Сериал',
    season: '2',
    episode: '5',
    real_width: 1920,
    real_height: 1080,
  });
  const row = db.createTask(input);
  const task = db.serializeTask(row);
  assert.equal(task.realWidth, 1920);
  assert.equal(task.realHeight, 1080);

  db.updateTask(task.id, { real_width: 1440, real_height: 1080 });
  const updated = db.serializeTask(db.getTask(task.id));
  assert.equal(updated.realWidth, 1440);
  assert.equal(updated.realHeight, 1080);
});

test('spaceInput отдаёт все незаконченные задачи и веса скачанного', () => {
  const base = {
    title: 'Сериал',
    movie_id: '9',
    quality: '1080p',
    file_type: 'video',
    real_width: null,
    real_height: null,
  };
  db.createTask({ ...base, url: 'https://cdn.example/s1e1.mp4', total_bytes: 2 * 1024 ** 3 });
  db.createTask({ ...base, url: 'https://cdn.example/s1e2.mp4', total_bytes: 0 });
  const errorRow = db.createTask({ ...base, url: 'https://cdn.example/s1e3.mp4', total_bytes: 3 });
  db.updateTask(errorRow.id, { status: 'error' });

  const { unfinished, doneSizes } = db.spaceInput();
  // В базе есть и задачи из других тестов, поэтому смотрим только свой фильм.
  const mine = unfinished.filter((row) => row.movie_id === '9');
  assert.deepEqual(mine.map((row) => row.status).sort(), ['error', 'queued', 'queued']);
  assert.equal(mine.length, 3);
  // в весах скачанного — только задачи с известным ненулевым весом
  assert.ok(doneSizes.every((row) => row.total_bytes > 0));
  assert.equal(doneSizes.length, 1);
  assert.equal(doneSizes[0].movie_id, '7');
});
