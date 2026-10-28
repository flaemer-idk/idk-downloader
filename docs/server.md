# Сервер: модули, база, статусы, настройки, API, веб-морда

Справочник по `server/`. Как это работает в целом —
[`how-it-works.md`](how-it-works.md). Файлы описываются в порядке, в котором
удобно их читать.

Запуск и установка — в корневом `README.md` и `server/README.md`. Здесь только
«как устроено».

---

## 1. Модули по файлам

### `src/mango/` — манга (com-x.life, MangaDex, MangaLib)

Отдельная подсистема: 1 задание = пачка глав, внутри — последовательно.

- `naming.js` — чистые правила имён (`sanitizeName`, `parseChapterString`,
  `chapterFolderName`, `seriesFolderName`, `pageFileName`). Покрыты тестами.
- `comx.js` — адаптер com-x.life: разбор ссылок, скачивание картинок (DleGuard
  хосты картинок не охраняет — обычный `fetch`), выбор расширения по
  `Content-Type` (CDN отдаёт WebP даже при `.jpg` в URL).
- `mangadex.js` — адаптер MangaDex API v5: метаданные, feed с языком,
  `at-home` для страниц, свёртка дублей групп, лимит ~5 req/s, отчёт
  MangaDex@Home. HTML `mangadex.org` не открывается (он может быть заблокирован).
- `mangalib.js` — адаптер MangaLib: `api.imglib.info/api` (резерв
  `api.cdnlibs.org/api`), заголовок `site-id: 1`, поиск по `q`, главы из
  `/manga/{slug_url}/chapters`, страницы из `/manga/{slug_url}/chapter`.
  Хосты картинок берутся из `/constants?fields[]=imageServers` (`download`,
  `main`, `secondary`, `compress`), есть fallback на `img3.cdnlibs.org` и
  зеркала. Браузер не используется.
- `browser.js` — серверный headless Chromium через `puppeteer-core` (тонкий
  клиент к системному браузеру, не Selenium): ленивый запуск, постоянный профиль
  рядом с БД, скрытый `navigator.webdriver`, один браузер на все запросы
  (очередь `exclusive`). Нужен потому, что DleGuard пропускает только настоящий
  браузерный отпечаток — curl/Node-fetch тарпитятся по таймауту. При старте
  сервера браузер не запускается: только в `fetchMangaInfo`/`fetchReaderInfo`.
- `index.js` — сервис: `resolveManga` (ComX/MangaDex/MangaLib → название, год,
  главы с признаком «уже скачано»), `createDownload` (фильтр уже скачанного,
  фоновое задание, прогресс по страницам), `listJobs`, `cancelJob`, `shutdown`.

Структура на диске: `{Название} [{год}]/Volume N/«8» или «8 - Название»/000.webp`.
Для MangaDex главы не на русском получают суффикс `[en]` (чтобы ru/en не
смешивались в одной папке); MangaLib всегда русский, без суффикса. Частичная
глава живёт как `<папка>.idk-part` и переименовывается целиком; существующая
папка = глава скачана. Дизайн — [`../mango.md`](../mango.md) (исторический
прототип — `prototypes/mango/mango.md`).

### `src/config.js` — что можно настроить при старте

Философия: **из командной строки меняется только порт** (плюс `--help`,
`--version`). Всё остальное живёт в веб-морде (и хранится в SQLite), чтобы не
редактировать systemd-юнит ради смены шаблона имени.

- `parseCliArgs` — свой мини-парсер: `-p/--port` (в трёх формах: `--port 8081`,
  `-p8081`, `--port=8081`), `-h/--help`, `-v/--version`. Неизвестный аргумент —
  понятная ошибка, а не падение.
- Переменные окружения (нужны для systemd/NixOS): `PORT`, `HOST`, `DB_FILE`,
  `DOWNLOAD_DIR`, `LIBRARY_DIR` (начальное значение медиатеки), `MANGO_DIR`
  (начальное значение папки манги), `CHROMIUM_PATH` (браузер только для
  com-x.life), `AUTH_TOKEN`, `FFMPEG_PATH`, `USER_AGENT`.
- `usage()` — текст `--help`. Он держится в одном месте с текущими дефолтами.

### `src/logger.js` — логи и баннер

- Уровни: `info` (синий), `done` (зелёный «ГОТОВО»), `warn` (жёлтый), `error`
  (красный). Идентификаторы задач `#12` подсвечиваются.
- Цвета включаются **только** когда вывод — терминал (`process.stdout.isTTY`).
  В systemd/journald или при `NO_COLOR=1` остаётся чистый текст — journald не
  должен хранить ANSI-мусор.
- `printBanner` — стартовая шапка: версия, порт, папки, найден ли ffmpeg,
  включён ли токен и **все LAN-адреса** (по ним настраивается расширение).

### `src/db.js` — SQLite

Единственная таблица-агрегат `tasks` (схема — в разделе 2) и `settings`
(key-value строк). Детали, о которых надо знать:

- **Ленивое открытие**: `getDb()` открывает базу при первом обращении, а не при
  импорте модуля. Благодаря этому `--help`/`--version` не создают файлов, и
  пакет NixOS можно запускать из read-only окружения.
- `PRAGMA journal_mode = WAL` + `synchronous = NORMAL` — много мелких записей
  прогресса не превращают базу в тормоз.
- **Миграции в двух видах**:
  1. недостающие колонки добавляются через `ALTER TABLE` (`year`,
     `subtitle_lang_code`, `queue_hidden`, `real_width`, `real_height`) — базы
     старых версий продолжают работать;
  2. `LEGACY_DEFAULTS` — если пользователь **не менял** шаблоны имён, а
     дефолт обновился (это менялось уже несколько раз), значение в БД
     заменяется на новый дефолт. Тронутые пользователем шаблоны не трогаются.
- `claimNextTask(now)` — атомарный «отщип» из очереди: `UPDATE tasks SET
  status='downloading' WHERE id = (SELECT … WHERE status='queued' AND
  next_attempt_at <= now ORDER BY id LIMIT 1) RETURNING *`. Два воркера не
  могут взять одну задачу — это одна SQL-инструкция.
- `spaceInput()` — вход для расчёта места: **все** незаконченные задачи плюс
  веса готовых (для средних). Сознательно не ограничено лимитом 300 строк,
  как `listTasks`.
- `resetInterruptedTasks()` — после рестарта `downloading → queued` (докачка
  с `.part`).
- `serializeTask` — перевод camelCase ↔ snake_case на границе API.

### `src/tasks.js` — приём задачи (`prepareTask`)

Единая точка входа для задачи из любого клиента (расширение, веб-морда, curl):

- валидирует URL (`http(s)://` обязателен) — заодно отсекает ссылки на страницы;
- определяет `file_type`: явное поле → `.vtt` в URL → по умолчанию `video`;
- принимает поля в обоих стилях: `movie_id` и `movieId`, `alt_urls` и `altUrls`
  и т.д. (клиенты разные, сервер терпимый);
- строит `filename`, если клиент его не прислал: с метаданными — по шаблону из
  настроек, без метаданных — из самой ссылки (`filenameFromUrl`).

### `src/util.js` — имена файлов и санитайзинг

Самый «интеллектуальный» файл сервера. Всё, что собирает путь файла:

- `cleanSegment`/`sanitizeRelPath` — убирают запрещённые в Windows/Linux
  символы, схлопывают пробелы, ограничивают длину сегмента 150 символами.
  Слэши **внутри значений** (например, `AC/DC` в названии) превращаются в
  пробелы — подпапки создаёт только `/` в самом шаблоне.
- `ensureExtension` — дописывает/заменяет расширение: видео всегда `.mp4`
  (даже если пришёл URL на `.ts` — контейнер всё равно пере-склеивается
  ffmpeg'ом только для HLS; обычный mp4-поток сохраняется как есть),
  субтитры — `.vtt` (кроме `.srt`, который оставляется). Хвост `.rus`
  («American Psycho.rus») распознаётся как код языка, а не расширение.
- `buildFilename` — раскрывает шаблон плейсхолдерами (полный список — в разделе
  «Настройки»). `%sxxexx%` даёт ` S1E2` **без ведущих нулей** — так Jellyfin
  тоже умеет, а имена короче. Сверху добавляется папка категории медиатеки.
- `pickBestTitle` — «лучшее название». Оригинальное название бывает строкой из
  вариантов: `Gekijouban… / Beyond the Boundary…`. Скоринг: ASCII-вариант —
  +1, каждое английское слово из словаря — ещё +2; при равном счёте берётся
  последний вариант (на сайте порядок «Romaji / English»). Итог: английский →
  оригинальный → локализованный.
- `subtitleLangCode` — «Русский» → `rus`. Источники по приоритету: код от сайта
  (`subtitle_lns`, он точнее словаря) → словарь из ~40 языков (переводит
  названия, терпит скобки и лишние слова: «Русский (rus)», «русский
  дублированный») → транслитерация незнакомого (`Португальский (Бразилия)` →
  `portugalskij`), чтобы в имени файла не было кириллицы.
- `uniquifyPath` — `file.mp4` → `file (1).mp4`, если перезапись выключена.
- `parseCategoryMap`/`categoryFolder` — разбор настройки «категории → папки»
  (`films = Фильмы`, `# комментарий`, ключ `default` для остальных).

### `src/estimate.js` — «сколько ещё нужно места»

Чистая функция `estimateRemaining(unfinished, doneSizes)`. Правила:

- считаются **все** незаконченные статусы (`queued`, `downloading`, `paused`,
  `error`) — они все потенциально лягут на диск;
- из известного веса вычитается `received_bytes` — докачанное место не считается
  дважды;
- неизвестный вес: среднее по скачанным задачам этого фильма → общее среднее →
  заглушка `PLACEHOLDER_BYTES` (1.5 ГБ). Число задач, посчитанных «на глазок»,
  отдаётся отдельным полем (`unknown`), чтобы показать «вес неизвестен: N»;
- субтитры без известного веса не оцениваются вовсе (их вес — килобайты);
- `error` учитывается: кнопка «Повторить» вернёт задачу в очередь, значит место
  под неё держим.

### `src/downloader.js` — качалка

Самый большой модуль. Ключевые структуры:

- `active: Map<id, {controller: AbortController, mode}>` — активные загрузки.
  `mode` — что хотим от этой загрузки: `run` / `pause` / `cancel`. Воркер после
  обрыва смотрит на mode и решает: пауза (`.part` сохранить) или отмена
  (`.part` удалить).
- Пул: `start()` вешает таймер 500 мс; `fillWorkers()` держит число воркеров
  равным `max_concurrent` (настройка, жёсткий потолок 16). Уменьшили лимит —
  лишние воркеры выходят после текущей задачи. Воркер живёт в цикле: взять
  задачу (`claimNextTask`) или спать 500 мс.
- `saveDir()` — куда пишем: медиатека (`library_dir`), если настроена, иначе
  папка загрузок. Используется и API (для честного свободного места), и
  воркерами.
- `downloadHttp` — обычный файл: докачка через Range, перебор зеркал
  (`alt_urls`), после неудачи URL размер перечитывается с диска.
- `httpGet` — GET **на core-модулях** `node:http`/`node:https` (не `fetch`!):
  undici роняет весь процесс, если соединение обрывается, пока поток стоит на
  backpressure (быстрый CDN + медленный диск). Редиректы до 5 штук, отмена
  через `AbortSignal`.
- `fetchToFile` — пишет поток в `.part`, прогресс в БД не чаще 500 мс,
  проверяет итоговый размер (`Content-Range` должен сойтись).
- `downloadHls` — `.m3u8` через `ffmpeg -c copy` с `Referer`/UA; прогресс — по
  размеру временного файла (раз в секунду); отмена — `SIGKILL`.
- Массовые операции: `cancelAll`, `pauseAll`, `resumeAll`, `cancelMovie` (для
  кнопки «Отменить этот фильм» в попапе), и одиночные: `cancelTask`,
  `pauseTask`, `resumeTask`, `retryTask`. Пауза **очередной** задачи — просто
  смена статуса; пауза активной — abort с mode `pause`.

### `src/api.js` — HTTP

- Роутер «по регуляркам» — без фреймворков. JSON-ответы, лимит тела 5 МБ.
- CORS открыт (`*`) — к серверу обращается расширение с любых страниц.
- Токен (если задан `AUTH_TOKEN`): заголовок `X-Auth-Token` или `?token=`.
  На `/api/*`; статика и OPTIONS — без токена.
- Статика: раздаёт `public/`, защита от выхода за пределы каталога
  (`path.normalize` + проверка префикса), кэш `no-cache` (морда всегда свежая).
- `spaceSummary()` — сводка места для `/api/state`: свободно/всего по папке,
  куда реально пишутся файлы, плюс `needBytes` из `estimate.js`.

### `src/index.js` — точка входа

Порядок запуска:

1. CLI-гейт: `--help`/`--version`/мусорные аргументы/кривой порт — выход **до**
   открытия базы (ничего не создаются).
2. Читает настройки, создаёт папку загрузок.
3. Возвращает «зависшие» `downloading`-задачи в очередь (докачка с `.part`).
4. Запускает пул воркеров.
5. Поднимает HTTP-сервер, печатает баннер с LAN-адресами.
6. Обработчики: `EADDRINUSE` → понятная подсказка; SIGINT/SIGTERM → мягкая
   остановка (до 3 с); `unhandledRejection` → лог вместо падения процесса.

---

## 2. Статусы задачи и жизнь одной строки в БД

```
 queued ──► downloading ──► done
   ▲  ▲         │   │
   │  │         │   └──► paused ──► (resume → queued)
   │  │         └──(сбой)──► queued (повтор через delay) … ──► error (попытки вышли)
   │  └──(пауза очереди)──► paused
   └──(рестарт сервера: downloading → queued, докачка с .part)

 cancelled: из queued/paused по кнопке (из downloading — через abort+mode=cancel)
```

| Статус | Смысл | `.part` |
|---|---|---|
| `queued` | Ждёт слота (или повторной попытки — см. `next_attempt_at`) | сохранён |
| `downloading` | Воркер качает | растёт |
| `paused` | Снял пользователь («пауза») | сохранён |
| `done` | Готов, `file_path` валиден | — |
| `error` | Попытки кончились, `error` — текст | сохранён (повторить можно) |
| `canceled` | Отменил пользователь | **удалён** |

Дополнительные поля-переключатели:

- `next_attempt_at` — время следующей попытки (повтор с нарастающей задержкой);
  `claimNextTask` не берёт задачу раньше этого времени.
- `attempts` — сколько раз падала (сравнивается с `max_attempts`).
- `queue_hidden` — «скрыть из очереди, оставив в истории» (кнопка «Очистить
  завершённые» скрывает, а не удаляет; полная очистка — `clear-finished`).

---

## 3. Схема БД

```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'queued',   -- queued/downloading/paused/done/error/canceled
  url TEXT NOT NULL,                       -- основная прямая ссылка
  alt_urls TEXT NOT NULL DEFAULT '[]',     -- JSON-массив резервных ссылок («or»-зеркала)
  filename TEXT,                           -- относительный путь (с подпапками)
  referer TEXT,                            -- страница-источник: заголовок для CDN + «вернуться за свежей ссылкой»
  group_key TEXT, movie_id TEXT,           -- группировка в UI (фильм → серия)
  title TEXT, orig_title TEXT,             -- локализованное и «лучшее» названия
  quality TEXT, voiceover TEXT,
  season TEXT, season_title TEXT,
  episode TEXT, episode_title TEXT,
  year TEXT,                               -- год из диапазона «1999–2007» → 1999
  file_type TEXT NOT NULL DEFAULT 'video', -- video | subtitle
  subtitle_lang TEXT,                      -- «Русский» (для отображения)
  subtitle_lang_code TEXT,                 -- «rus» (для имени файла; от сайта точнее словаря)
  real_width INTEGER, real_height INTEGER, -- реальное разрешение от пробы клиента
  total_bytes INTEGER NOT NULL DEFAULT 0,  -- ожидаемый вес (от пробы / Content-Length)
  received_bytes INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  file_path TEXT,                          -- финальный путь (после done)
  created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER,
  queue_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_tasks_queue ON tasks(status, next_attempt_at, id);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE mango_chapters (              -- история скачанных глав манги
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_key TEXT NOT NULL,                -- «comx:26588» / «mangadex:<uuid>» / «mangalib:206»
  series_url TEXT NOT NULL,
  series_title TEXT, year TEXT,
  chapter_id TEXT NOT NULL,                -- id главы с сайта
  volume TEXT, number TEXT, title TEXT,    -- разобранная строка «1 - 2.5 Экстра»
  folder TEXT,                             -- имя папки главы на диске
  pages INTEGER NOT NULL DEFAULT 0,
  source TEXT,                             -- comx | mangadex | mangalib
  language TEXT,                           -- ru, en, pt-br…
  group_name TEXT,                         -- сканлейт-группа MangaDex/MangaLib
  chapter_url TEXT,                        -- ссылка на главу
  is_external INTEGER NOT NULL DEFAULT 0,  -- externalUrl у MangaDex
  created_at INTEGER NOT NULL,
  UNIQUE(series_key, chapter_id)
);
CREATE INDEX idx_mango_series ON mango_chapters(series_key);

CREATE TABLE mango_series (                -- стабильная папка тайтла
  series_key TEXT PRIMARY KEY,             -- comx:26588 / mangadex:<uuid> / mangalib:206
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT, year TEXT,
  folder TEXT NOT NULL,                    -- не пересчитывается при переименовании
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_mango_series_folder ON mango_series(folder);
```

Времена — `Date.now()` (мс). Многих «полей фильма» нет, потому что сервер их не
знает сам: он получает ровно то, что прислал клиент.

## 4. Настройки (таблица `settings`, веб-морда, `PATCH /api/settings`)

| Ключ | Дефолт | Что делает |
|---|---|---|
| `download_dir` | `server/downloads` | Папка загрузок (если медиатека не задана) |
| `library_dir` | пусто | Папка медиатеки. Задана → файлы пишутся сразу туда, минуя загрузки |
| `library_categories` | `films = Фильмы`… | Построчно: `раздел = папка`. `default` — для остальных разделов |
| `mango_dir` | пусто | Папка манги; пусто — подпапка `mango` в папке загрузок |
| `chromium_path` | пусто | Путь к Chromium только для com-x.life (DleGuard); MangaDex/MangaLib не используют браузер |
| `max_concurrent` | `2` | Параллельных загрузок (1–16) |
| `max_attempts` | `5` | Попыток на задачу (1–50) |
| `retry_delay_ms` | `15000` | Базовая задержка повтора (× номер попытки, потолок 5 минут) |
| `overwrite_existing` | `1` | Заменять готовый файл при повторной загрузке (иначе `Файл (1).mp4`) |
| `filename_template_film` | `%orig_title%%year_part%/%orig_title%` | Имя фильма |
| `filename_template_series` | `%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%` | Имя серии |
| `filename_template_subtitle` | `…%orig_title%%sxxexx%.%subtitle_lang%` | Имя субтитра (код языка в суффиксе — так ждёт Jellyfin) |

Плейсхолдеры шаблонов: `%title%`, `%orig_title%` (лучшее название), `%quality%`,
`%voiceover%`, `%year%`, `%year_part%` (« (2022)» или пусто), `%season%`,
`%season_id%`, `%episode%`, `%episode_id%`, `%sxxexx%` (« S1E2»),
`%season_folder%` («Season 1» или пусто), `%movie_id%`, `%subtitle_lang%`
(код: `rus`), `%subtitle_lang_raw%` (название: «Русский»). `/` в шаблоне
создаёт подпапку; пустые сегменты отбрасываются; расширение дописывается
автоматически.

---

## 5. API

Базовый адрес: `http://<сервер>:8080`. Авторизация (если задан `AUTH_TOKEN`):
заголовок `X-Auth-Token` или `?token=`. CORS `*`. Все ответы — JSON.
Ошибки — `{"error": "текст"}` с кодом 400/401/404/409/500.

| Метод и путь | Что делает |
|---|---|
| `GET /api/state?limit=300` | Всё состояние: `server` (версия, ffmpeg, папки, место, `needBytes`, `spaceEnough`), `stats` (счётчики по статусам), `settings`, `tasks` (до `limit`, максимум 1000) |
| `POST /api/tasks` | Добавить задачу/партию: один объект, `{tasks:[…]}` или массив. Максимум 2000. Ответ `201`: `{created, tasks, space}` — `space` пересчитан уже с новыми задачами |
| `POST /api/tasks/:id/cancel` \| `/pause` \| `/resume` \| `/retry` | Управление одной задачей. `409`, если действие неприменимо (например, `pause` у `done`) |
| `DELETE /api/tasks/:id?file=1` | Удалить запись; `file=1` — удалить и файл с диска (активная задача сначала отменяется) |
| `POST /api/tasks/cancel-all` | Отменить всё, что `queued`/`downloading`/`paused` (`.part` удаляется) |
| `POST /api/tasks/pause-all` | Пауза всему активному и ожидающему |
| `POST /api/tasks/resume-all` | Снять всё с паузы |
| `POST /api/tasks/clear-finished` | **Удалить** записи из истории. Тело (необязательно): `{"statuses": ["done","error","canceled","paused"]}` |
| `POST /api/tasks/hide-finished` | Скрыть завершённые из списка очереди, оставив в истории |
| `POST /api/tasks/retry-failed` | Все `error` → `queued` (сброс попыток) |
| `GET /api/movies/:movieId` | Сводка по фильму: счётчики по статусам + сколько файлов лежит на диске |
| `POST /api/movies/:movieId/cancel` | Отменить незаконченные задачи фильма. Ответ: `{canceled, movie}` — свежая сводка, чтобы попап сразу перерисовался |
| `GET /api/settings` | Настройки как есть |
| `PATCH /api/settings` | Частичное обновление. Валидация: `max_concurrent` 1–16, `max_attempts` 1–50, `retry_delay_ms` 1000–3600000; пути резолвятся в абсолютные и создаются; шаблоны не могут быть пустыми |
| `POST /api/mango/resolve` | `{url, language?}` — com-x.life, MangaDex или MangaLib. Возвращает `{source, sourceLabel, title, year, folder, language, languages, chapters:[{id, volume, number, title, folder, language, group, external, unavailable, downloaded, pending}]}` |
| `POST /api/mango/download` | `{url, chapters:[id…], language?}` — ставит пачку глав в фоновую очередь. Ответ `201 {job, alreadyDownloaded, total, info}`; если всё выбранное уже скачано — `job: null` (интерфейс показывает предупреждение) |
| `GET /api/mango/jobs` | Задания манги с прогрессом: `current {label, pagesDone, pagesTotal}`, `done/total`, `failed[]`; `stats.chapters` — сколько глав в истории |
| `GET /api/mango/jobs/:id` | Полное задание с главами и их статусами (интерфейс догружает для завершённых карточек один раз) |
| `POST /api/mango/series/:key/pause` \| `/resume` | Пауза/продолжение всех живых заданий тайтла; текущая страница дописывается, дальше задание ждёт |
| `POST /api/mango/series/:key/cancel` | Отменить все живые задания тайтла (недокачанная глава `.idk-part` удаляется) |
| `POST /api/mango/series/:key/delete` | Удалить скачанное: останавливает задания, убирает папки `Volume N` и историю глав; `Cover.png` и файлы юзера в папке тайтла не трогает |
| `POST /api/mango/series/:key/volume/:volume/delete` | Удалить один том: папку `Volume N` и его записи в истории (пока задание живо — ошибка) |
| `POST /api/mango/jobs/:id/cancel` | Отменить одно задание (недокачанная глава `.idk-part` удаляется) |
| `GET /api/mango/history` | Последние скачанные главы из БД (`limit`, максимум 1000) |

Примеры:

```bash
# одна задача
curl -X POST http://192.168.1.50:8080/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://cdn.example/movie.mp4","title":"Фильм","referer":"https://example/films/…"}'

# партия (как делает расширение)
curl -X POST http://192.168.1.50:8080/api/tasks -H 'Content-Type: application/json' \
  -d '{"tasks":[{"url":"…"},{"url":"…"}]}'

# с токеном
curl -H 'X-Auth-Token: секрет' http://192.168.1.50:8080/api/state

# сдвинуть настройки
curl -X PATCH http://192.168.1.50:8080/api/settings -H 'Content-Type: application/json' \
  -d '{"max_concurrent":4,"library_dir":"/mnt/media/Jellyfin"}'
```

Поля задачи, которые понимает `POST /api/tasks` (все необязательные, кроме
`url`): `url`, `alt_urls` (или `altUrls`), `filename`, `referer`,
`group_key`/`groupKey`, `movie_id`/`movieId`, `title`, `orig_title`/`origTitle`,
`quality`, `voiceover`, `season`, `season_title`/`seasonTitle`, `episode`,
`episode_title`/`episodeTitle`, `year`, `category`, `file_type`/`fileType`,
`subtitle_lang`/`subtitleLang`, `subtitle_lang_code`/`subtitleLangCode`,
`total_bytes`/`totalBytes`, `real_width`/`realWidth`, `real_height`/`realHeight`.

---

## 6. Веб-морда (`server/public/`)

Ванильный JS без сборки, раздаётся самим сервером. Дизайн-особенности:

- **Три экрана** с hash-роутингом: `#/queue` (очередь), `#/history` (таблица
  истории с поиском и фильтром), `#/settings` (форма настроек). Сайдбар: бренд,
  переключатель языка (en/ru), виджет сервера — **свободное место с полоской**,
  папка, куда реально пишутся файлы, точка ffmpeg.
- **Опрос**: `GET /api/state` раз в секунду (`app.js: refresh`). Скорость
  считается на клиенте по разнице `received_bytes` между опросами
  (`updateSpeeds`). Токен (если просит сервер) хранится в `localStorage`
  (`idk_token`), запрашивается модалкой.
- **Группировка**: задачи сворачиваются в фильм → серия → файлы
  (`groupTasks`/`groupFiles`). У группы — агрегатный статус и действия
  (пауза/продолжить/отменить/повторить/удалить) на весь фильм. Кнопки
  «Пауза все / Возобновить все / Повторить сбойные / Очистить / Остановить все»
  — в тулбаре.
- **KPI-полоса**: качается / в очереди / готово / «Осталось ≈ N» (из `needBytes`,
  с пометкой «вес неизвестен: K», если есть оценённые задачи).
- **Двухкликовое подтверждение**: опасные кнопки не открывают `confirm()`,
  а требуют второй клик («Точно?») — модалки только для формы «Добавить по
  ссылке» и запроса токена.
- **i18n**: атрибуты `data-i18n` + словари en/ru прямо в `app.js`.
- Превью шаблонов имён в настройках собирается на примерах («Minions» (2015),
  сериал с 3 сериями) — до сохранения видно, что получится.

---

## 7. Тесты

```bash
cd server && npm test        # node --test, без зависимостей
```

- `test/estimate.test.mjs` — правила расчёта места (известный вес минус
  скачанное, средние, заглушка, субтитры).
- `test/db.test.mjs` — миграция старых баз (добавление колонок), приём
  `real_width`/`real_height`, сериализация. Работает на временной базе в `/tmp`.
- `test/cancel-movie.test.mjs` — `cancelMovie`: свои незаконченные отменяются,
  чужие и готовые — нет, `.part` убирается.

Расширение тестируется отдельно (см. [`extension.md`](extension.md#6-тесты)).

## 8. Диагностика — быстрые ответы

- **`node:sqlite` не найден** → Node старше 22.5, обновите (`node -v`).
- **HTTP 403 у задачи** → CDN требует Referer; смотрите подсказку «протухшая
  ссылка» — перешлите задачу со страницы заново из расширения.
- **`.m3u8` не качается** → поставьте ffmpeg.
- **«свободно N ГБ», а на диске иначе** → место считается по `saveDir`
  (медиатека, если настроена). Проверить: `GET /api/state → server.saveDir`.
- **Порт занят** → сервер сам подскажет: `PORT=8081 node src/index.js`.
