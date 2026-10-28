import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { UNFINISHED_STATUSES } from './estimate.js';

const DEFAULT_LIBRARY_RULES = [
  { section: 'animation', kind: 'film', rating: 'any', folder: 'морковные фильмы' },
  { section: 'animation', kind: 'series', rating: 'any', folder: 'морковные несколькосерий' },
  { section: 'films', kind: 'film', rating: 'any', folder: 'арбузные фильмы' },
  { section: 'series', kind: 'series', rating: 'any', folder: 'арбузные несколькосерий' },
  { section: 'cartoons', kind: 'film', rating: 'any', folder: 'банановые фильмы' },
  { section: 'cartoons', kind: 'series', rating: 'any', folder: 'банановые несколькосерий' },
  { section: 'cartoons', kind: 'film', rating: '16+', folder: 'томатные фильмы' },
  { section: 'cartoons', kind: 'film', rating: '18+', folder: 'томатные фильмы' },
  { section: 'cartoons', kind: 'series', rating: '16+', folder: 'томатные несколькосерий' },
  { section: 'cartoons', kind: 'series', rating: '18+', folder: 'томатные несколькосерий' },
];

const DEFAULT_SETTINGS = {
  download_dir: config.defaultDownloadDir,
  max_concurrent: '2',
  max_attempts: '5',
  retry_delay_ms: '15000',
  // 1 — заменять готовый файл при повторной загрузке (без « (1)»)
  overwrite_existing: '1',
  // Legacy column; download_dir is the library root now.
  library_dir: '',
  // MangaLib / ComX / MangaDex subfolder (MANGO_DIR overrides)
  mango_dir: config.defaultMangoDir,
  // Chromium for Manga sources (CHROMIUM_PATH overrides)
  chromium_path: config.chromiumPath,
  // Legacy mapping kept for migration; the UI uses library_rules.
  library_categories: [
    'films = арбузные фильмы',
    'series = арбузные несколькосерий',
    'animation = морковные фильмы',
    'cartoons = банановые фильмы',
    'documentary = Документальные',
  ].join('\n'),
  library_rules: JSON.stringify(DEFAULT_LIBRARY_RULES),
  // Год — только на папке; серии — в подпапке «Season N»; имя субтитра
  // совпадает с именем видео, а язык — кодом в суффиксе (American Psycho.rus.vtt),
  // как это ждёт Jellyfin.
  filename_template_film: '%orig_title%%year_part%/%orig_title%',
  filename_template_series: '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%',
  filename_template_subtitle:
    '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%.%subtitle_lang%',
  filename_template_mango:
    '%orig_title%%year_part%/Volume %volume%/%chapter%%chapter_title_part%',
  // Rezka Netscape cookie export; parsed by server/src/rezka.js.
  rezka_cookies: '',
};

/** Старые значения по умолчанию — заменяются на новые автоматически. */
const LEGACY_DEFAULTS = [
  // самая первая версия сервера
  ['filename_template_film', '%orig_title% [%quality%]'],
  [
    'filename_template_series',
    '%orig_title%/S%season_id%/%orig_title% S%season_id%E%episode_id% [%quality%]',
  ],
  // версия без года
  ['filename_template_film', '%orig_title%/%orig_title%'],
  ['filename_template_series', '%orig_title%/%orig_title% S%season_id%E%episode_id%'],
  ['filename_template_subtitle', '%orig_title%/%orig_title%%sxxexx% [%subtitle_lang%]'],
  // версия с годом в имени файла
  ['filename_template_film', '%orig_title%%year_part%/%orig_title%%year_part%'],
  [
    'filename_template_series',
    '%orig_title%%year_part%/%orig_title%%year_part% S%season_id%E%episode_id%',
  ],
  [
    'filename_template_subtitle',
    '%orig_title%%year_part%/%orig_title%%year_part%%sxxexx% [%subtitle_lang%]',
  ],
  // версия с «Season N» в шаблоне литералом (у фильмов появлялась папка Season)
  [
    'filename_template_series',
    '%orig_title%%year_part%/Season %season_id%/%orig_title%%sxxexx%',
  ],
  [
    'filename_template_subtitle',
    '%orig_title%%year_part%/Season %season_id%/%orig_title%%sxxexx% [%subtitle_lang%]',
  ],
  // версия с языком в квадратных скобках («[Русский]» вместо кода «.rus»)
  [
    'filename_template_subtitle',
    '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx% [%subtitle_lang%]',
  ],
];

/**
 * База открывается лениво: импорт модуля не должен ничего создавать на диске
 * (важно для `--help`/`--version` и для запуска из read-only окружения Nix).
 */
let dbInstance = null;

function initDb(db) {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
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
      year            TEXT,
      episode         TEXT,
      episode_title   TEXT,
      file_type       TEXT    NOT NULL DEFAULT 'video',
      subtitle_lang   TEXT,
      subtitle_lang_code TEXT,
      real_width      INTEGER,
      real_height     INTEGER,
      total_bytes     INTEGER NOT NULL DEFAULT 0,
      received_bytes  INTEGER NOT NULL DEFAULT 0,
      attempts        INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      error           TEXT,
      file_path       TEXT,
      created_at      INTEGER NOT NULL,
      started_at      INTEGER,
      finished_at     INTEGER,
      queue_hidden    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_queue ON tasks(status, next_attempt_at, id);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mango_chapters (
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
      source       TEXT,
      language     TEXT,
      group_name   TEXT,
      chapter_url  TEXT,
      is_external  INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      UNIQUE(series_key, chapter_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mango_series ON mango_chapters(series_key);

    -- Стабильная папка тайтла: переименование на сайте не создаёт вторую
    -- папку, а коллизии имён между источниками решаются один раз.
    CREATE TABLE IF NOT EXISTS mango_chapter_overrides (
    series_key TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    volume TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (series_key, chapter_id)
  );

  CREATE TABLE IF NOT EXISTS mango_series (
      series_key TEXT PRIMARY KEY,
      source     TEXT NOT NULL,
      url        TEXT NOT NULL,
      title      TEXT,
      year       TEXT,
      folder     TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mango_series_folder ON mango_series(folder);
  `);

  // Миграция существующих баз: добавляем колонки, которых в них ещё нет.
  const columns = db.prepare('PRAGMA table_info(tasks)').all().map((row) => row.name);
  for (const [name, type] of [
    ['year', 'TEXT'],
    ['subtitle_lang_code', 'TEXT'],
    ['queue_hidden', 'INTEGER NOT NULL DEFAULT 0'],
    ['real_width', 'INTEGER'],
    ['real_height', 'INTEGER'],
  ]) {
    if (!columns.includes(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${type}`);
  }

  const mangoColumns = db
    .prepare('PRAGMA table_info(mango_chapters)')
    .all()
    .map((row) => row.name);
  for (const [name, type] of [
    ['source', 'TEXT'],
    ['language', 'TEXT'],
    ['group_name', 'TEXT'],
    ['chapter_url', 'TEXT'],
    ['is_external', 'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    if (!mangoColumns.includes(name)) {
      db.exec(`ALTER TABLE mango_chapters ADD COLUMN ${name} ${type}`);
    }
  }

  const insert = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, String(value));

  // Миграция: если пользователь не менял шаблоны, обновляем их до новых.
  const update = db.prepare('UPDATE settings SET value = ? WHERE key = ? AND value = ?');
  for (const [key, legacyValue] of LEGACY_DEFAULTS) {
    update.run(String(DEFAULT_SETTINGS[key]), key, legacyValue);
  }
}

export function getDb() {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  dbInstance = new DatabaseSync(config.dbFile);
  initDb(dbInstance);
  return dbInstance;
}

const stmtCache = new Map();
function q(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = getDb().prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

const TASK_COLUMNS = [
  'status',
  'url',
  'alt_urls',
  'filename',
  'referer',
  'group_key',
  'movie_id',
  'title',
  'orig_title',
  'quality',
  'voiceover',
  'season',
  'season_title',
  'year',
  'episode',
  'episode_title',
  'file_type',
  'subtitle_lang',
  'subtitle_lang_code',
  'real_width',
  'real_height',
  'total_bytes',
  'received_bytes',
  'attempts',
  'next_attempt_at',
  'error',
  'file_path',
  'created_at',
  'started_at',
  'finished_at',
  'queue_hidden',
];

function normalizeValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

export function getSettings() {
  const rows = q('SELECT key, value FROM settings').all();
  const result = { ...DEFAULT_SETTINGS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}

export function setSettings(patch) {
  const stmt = q(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    stmt.run(key, String(value));
  }
}

export function createTask(input) {
  const row = {
    status: 'queued',
    url: input.url,
    alt_urls: JSON.stringify(Array.isArray(input.alt_urls) ? input.alt_urls : []),
    filename: input.filename,
    referer: input.referer,
    group_key: input.group_key,
    movie_id: input.movie_id,
    title: input.title,
    orig_title: input.orig_title,
    quality: input.quality,
    voiceover: input.voiceover,
    season: input.season,
    season_title: input.season_title,
    year: input.year,
    episode: input.episode,
    episode_title: input.episode_title,
    file_type: input.file_type === 'subtitle' ? 'subtitle' : 'video',
    subtitle_lang: input.subtitle_lang,
    subtitle_lang_code: input.subtitle_lang_code,
    real_width: input.real_width,
    real_height: input.real_height,
    total_bytes: Number(input.total_bytes) || 0,
    received_bytes: 0,
    attempts: 0,
    next_attempt_at: 0,
    error: null,
    file_path: null,
    created_at: Date.now(),
    started_at: null,
    finished_at: null,
  };

  const keys = TASK_COLUMNS.filter((key) => key in row);
  const sql = `INSERT INTO tasks (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) RETURNING *`;
  return q(sql).get(...keys.map((key) => normalizeValue(row[key])));
}

/** Атомарно забирает следующую задачу из очереди (queued + время попытки пришло). */
export function claimNextTask(now) {
  return q(
    `UPDATE tasks SET status = 'downloading', started_at = ?, error = NULL
     WHERE id = (
       SELECT id FROM tasks
       WHERE status = 'queued' AND next_attempt_at <= ?
       ORDER BY id LIMIT 1
     )
     RETURNING *`,
  ).get(now, now);
}

export function listTaskRowsByStatuses(statuses) {
  if (!statuses.length) return [];
  const placeholders = statuses.map(() => '?').join(', ');
  return q(
    `SELECT id, filename, status FROM tasks WHERE status IN (${placeholders}) ORDER BY id`,
  ).all(...statuses);
}

/** Тот же список, но по одному фильму — для отмены «этого фильма» из попапа. */
export function listTaskRowsByMovie(movieId, statuses) {
  if (!statuses.length) return [];
  const placeholders = statuses.map(() => '?').join(', ');
  return q(
    `SELECT id, filename, status FROM tasks
     WHERE movie_id = ? AND status IN (${placeholders}) ORDER BY id`,
  ).all(String(movieId), ...statuses);
}

export function getTask(id) {
  return q('SELECT * FROM tasks WHERE id = ?').get(id);
}

export function listTasks(limit = 300) {
  return q(
    `SELECT * FROM tasks
     ORDER BY CASE status
       WHEN 'downloading' THEN 0
       WHEN 'queued' THEN 1
       WHEN 'paused' THEN 2
       WHEN 'error' THEN 3
       ELSE 4 END,
       id DESC
     LIMIT ?`,
  ).all(limit);
}

export function updateTask(id, patch) {
  const keys = TASK_COLUMNS.filter((key) => key in patch);
  if (keys.length === 0) return;
  const sql = `UPDATE tasks SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`;
  q(sql).run(...keys.map((key) => normalizeValue(patch[key])), id);
}

/**
 * Вход для оценки свободного места (см. estimate.js): берём ВСЕ незаконченные
 * задачи (не только первые 300 из listTasks) и веса уже скачанного — по ним
 * считается средний вес, когда у задачи он неизвестен.
 */
export function spaceInput() {
  const placeholders = UNFINISHED_STATUSES.map(() => '?').join(', ');
  const unfinished = q(
    `SELECT status, file_type, movie_id, title, total_bytes, received_bytes
     FROM tasks WHERE status IN (${placeholders})`,
  ).all(...UNFINISHED_STATUSES);
  const doneSizes = q(
    `SELECT movie_id, title, total_bytes FROM tasks WHERE status = 'done' AND total_bytes > 0`,
  ).all();
  return { unfinished, doneSizes };
}

export function deleteTask(id) {
  q('DELETE FROM tasks WHERE id = ?').run(id);
}

export function deleteTasksByStatuses(statuses) {
  if (!statuses.length) return 0;
  const placeholders = statuses.map(() => '?').join(', ');
  const info = q(`DELETE FROM tasks WHERE status IN (${placeholders})`).run(...statuses);
  return Number(info.changes);
}

/** «Очистить завершённые»: убирает задачи из списка очереди, не удаляя записи (они остаются в истории). */
export function hideTasksByStatuses(statuses) {
  if (!statuses.length) return 0;
  const placeholders = statuses.map(() => '?').join(', ');
  const info = q(
    `UPDATE tasks SET queue_hidden = 1 WHERE status IN (${placeholders}) AND queue_hidden = 0`,
  ).run(...statuses);
  return Number(info.changes);
}

export function retryFailedTasks() {
  const info = q(
    `UPDATE tasks SET status = 'queued', attempts = 0, next_attempt_at = 0, error = NULL,
     queue_hidden = 0
     WHERE status = 'error'`,
  ).run();
  return Number(info.changes);
}

/** После рестарта сервера возвращаем «зависшие» загрузки в очередь (докачаются с .part). */
export function resetInterruptedTasks() {
  const info = q(
    `UPDATE tasks SET status = 'queued', started_at = NULL WHERE status = 'downloading'`,
  ).run();
  return Number(info.changes);
}

/** Сколько задач и файлов уже есть по фильму (для предупреждения о дубликатах). */
export function movieSummary(movieId) {
  const rows = q(
    'SELECT status, file_path FROM tasks WHERE movie_id = ? AND movie_id IS NOT NULL',
  ).all(String(movieId));

  const summary = {
    movieId: String(movieId),
    total: rows.length,
    done: 0,
    downloading: 0,
    queued: 0,
    paused: 0,
    error: 0,
    canceled: 0,
    filesOnDisk: 0,
  };

  for (const row of rows) {
    if (summary[row.status] !== undefined) summary[row.status] += 1;
    if (row.file_path) {
      try {
        if (fs.existsSync(row.file_path)) summary.filesOnDisk += 1;
      } catch {}
    }
  }

  return summary;
}

export function getStats() {
  const rows = q('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all();
  const stats = { queued: 0, downloading: 0, paused: 0, done: 0, error: 0, canceled: 0 };
  for (const row of rows) stats[row.status] = Number(row.count);
  return stats;
}

export function serializeTask(row) {
  let altUrls = [];
  try {
    altUrls = JSON.parse(row.alt_urls || '[]');
  } catch {
    altUrls = [];
  }
  return {
    id: row.id,
    status: row.status,
    url: row.url,
    altUrls,
    filename: row.filename,
    referer: row.referer,
    movieId: row.movie_id,
    title: row.title,
    origTitle: row.orig_title,
    quality: row.quality,
    voiceover: row.voiceover,
    season: row.season,
    seasonTitle: row.season_title,
    year: row.year,
    episode: row.episode,
    episodeTitle: row.episode_title,
    fileType: row.file_type,
    subtitleLang: row.subtitle_lang,
    subtitleLangCode: row.subtitle_lang_code,
    realWidth: row.real_width ?? null,
    realHeight: row.real_height ?? null,
    totalBytes: row.total_bytes,
    receivedBytes: row.received_bytes,
    attempts: row.attempts,
    error: row.error,
    filePath: row.file_path,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    queueHidden: row.queue_hidden === 1,
  };
}

/* ---------------- манга ---------------- */

export function mangoChapterDownloaded(seriesKey, chapterId) {
  return !!q('SELECT 1 FROM mango_chapters WHERE series_key = ? AND chapter_id = ?').get(
    String(seriesKey),
    String(chapterId),
  );
}

export function getMangoSeries(seriesKey) {
  return q('SELECT * FROM mango_series WHERE series_key = ?').get(String(seriesKey)) || null;
}

export function getMangoSeriesByFolder(folder) {
  return q('SELECT * FROM mango_series WHERE folder = ?').get(String(folder)) || null;
}

/** Создаёт/обновляет метаданные тайтла. folder у существующей записи не меняется. */
export function saveMangoSeries(entry) {
  const now = Date.now();
  q(
    `INSERT INTO mango_series
       (series_key, source, url, title, year, folder, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(series_key) DO UPDATE SET
       source = excluded.source, url = excluded.url,
       title = excluded.title, year = excluded.year,
       updated_at = excluded.updated_at`,
  ).run(
    String(entry.seriesKey),
    String(entry.source),
    String(entry.url),
    entry.title ?? null,
    entry.year ?? null,
    String(entry.folder),
    now,
    now,
  );
  return getMangoSeries(entry.seriesKey);
}

export function deleteMangoSeries(seriesKey) {
  return Number(
    q('DELETE FROM mango_series WHERE series_key = ?').run(String(seriesKey)).changes,
  );
}

export function addMangoChapter(entry) {
  q(
    `INSERT INTO mango_chapters
       (series_key, series_url, series_title, year, chapter_id, volume, number,
        title, folder, pages, source, language, group_name, chapter_url,
        is_external, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(series_key, chapter_id) DO UPDATE SET
       pages = excluded.pages, folder = excluded.folder, title = excluded.title,
       volume = excluded.volume, number = excluded.number,
       source = excluded.source, language = excluded.language,
       group_name = excluded.group_name, chapter_url = excluded.chapter_url,
       is_external = excluded.is_external`,
  ).run(
    String(entry.seriesKey),
    String(entry.seriesUrl),
    entry.seriesTitle ?? null,
    entry.year ?? null,
    String(entry.chapterId),
    entry.volume ?? null,
    entry.number ?? null,
    entry.title ?? null,
    entry.folder ?? null,
    Number(entry.pages) || 0,
    entry.source ?? null,
    entry.language ?? null,
    entry.groupName ?? null,
    entry.chapterUrl ?? null,
    entry.external ? 1 : 0,
    Date.now(),
  );
}

/** Скачанные главы тайтла (для подсчёта и предупреждений). */
export function listMangoOverrides(seriesKey) {
  const rows = q('SELECT chapter_id, volume FROM mango_chapter_overrides WHERE series_key = ?').all(
    String(seriesKey),
  );
  const map = new Map();
  for (const row of rows) map.set(String(row.chapter_id), String(row.volume));
  return map;
}

export function setMangoOverride(seriesKey, chapterId, volume) {
  q(
    `INSERT INTO mango_chapter_overrides(series_key, chapter_id, volume, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(series_key, chapter_id) DO UPDATE SET
       volume = excluded.volume, updated_at = excluded.updated_at`,
  ).run(String(seriesKey), String(chapterId), String(volume), Date.now());
}

export function updateMangoChapterVolume(seriesKey, chapterId, volume) {
  return q(
    'UPDATE mango_chapters SET volume = ? WHERE series_key = ? AND chapter_id = ?',
  ).run(String(volume), String(seriesKey), String(chapterId)).changes;
}

export function deleteMangoOverrides(seriesKey) {
  return q('DELETE FROM mango_chapter_overrides WHERE series_key = ?').run(String(seriesKey)).changes;
}

export function deleteMangoVolumeOverrides(seriesKey, volume) {
  return q(
    'DELETE FROM mango_chapter_overrides WHERE series_key = ? AND volume = ?',
  ).run(String(seriesKey), String(volume)).changes;
}

export function listMangoChapters(seriesKey) {
  return q('SELECT * FROM mango_chapters WHERE series_key = ? ORDER BY id').all(String(seriesKey));
}

/** Последние скачанные главы — история манги в интерфейсе. */
export function listRecentMango(limit = 200) {
  return q('SELECT * FROM mango_chapters ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
}

/** Сколько глав манги скачано всего (KPI «Готово»). */
export function countMangoChapters() {
  return Number(q('SELECT COUNT(*) AS n FROM mango_chapters').get().n) || 0;
}

/** Удаление произведения: история глав тайтла (папки удаляет сервис манги). */
export function deleteMangoChapters(seriesKey) {
  const info = q('DELETE FROM mango_chapters WHERE series_key = ?').run(String(seriesKey));
  return Number(info.changes);
}

/** Удаление одного тома из истории тайтла. */
export function deleteMangoVolume(seriesKey, volume) {
  const info = q('DELETE FROM mango_chapters WHERE series_key = ? AND volume = ?').run(
    String(seriesKey),
    String(volume),
  );
  return Number(info.changes);
}
