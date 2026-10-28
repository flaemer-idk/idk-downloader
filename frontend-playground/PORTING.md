# PORTING: из прототипа в боевой код

Это не часть приложения. Здесь записано, что именно из
[`frontend-playground`](README.md) нужно перенести в `server/public` и
`server/src`, чтобы не восстанавливать логику по скриншотам.

## Что где лежит

| Прототип | Боевой код | Что делать |
|---|---|---|
| `frontend-playground/index.html` | `server/public/index.html` | перенести разметку: History-карточки, Add by link, настройки |
| `frontend-playground/app.js` | `server/public/app.js` | перенести рендеры и обработчики; файлы сейчас почти копии |
| `frontend-playground/styles.css` | `server/public/styles.css` | перенести стили History/карточек/настроек |
| `frontend-playground/mock-api.js` | `server/src/api.js` + новые модули | **не переносить как есть**; это фейковый API |
| `frontend-playground/playground-ui.js` | `server/public/app.js` или отдельный `mango-ui.js` | перенести только реальные UI-части, не dev-панель |
| `frontend-playground/playground.css` | `server/public/styles.css` | перенести стили карточек/редактора, не стили панели |
| `frontend-playground/serve.mjs` | не нужен | это только статическая раздача |

`app.js` в прототипе уже отличается от боевого: в нём есть карточки History,
редактор томов и карточки Add by link. Перед переносом лучше делать diff:

```bash
diff -u server/public/app.js frontend-playground/app.js
diff -u server/public/index.html frontend-playground/index.html
diff -u server/public/styles.css frontend-playground/styles.css
```

## 1. History: карточки вместо таблицы

**Только фронтенд.**

- В `index.html` таблица `#history-tbody` заменена на `#history-cards`.
- В `app.js`:
  - `histCard()` — группирует файлы по `movieId`/названию;
  - `histFileRow()` — строка файла с retry/delete;
  - `renderHistory()` собирает карточки;
  - обработчик `#history-cards` обрабатывает `data-hist-files` и `data-haction`.
- Стили — `.hist-card`, `.hist-file-row` в `playground.css`.

Переносить можно без изменений API: используются те же `GET /api/state` и
`POST /api/tasks/:id/retry`, `DELETE /api/tasks/:id`.

## 2. Редактор томов Mango

Это самая тяжёлая часть: в прототипе меняются только объекты в памяти, в бою
нужны **файлы на диске + БД**.

### Что уже есть в прототипе

- Кнопки `Edit volumes` у выбранного тайтла, задания и скачанной истории.
- Окно: выбор глав, числовое поле «куда», предпросмотр каскада.
- Каскад:
  - перенос в том с большим номером → едут главы от выбранной до конца
    исходного тома;
  - в том с меньшим номером → от начала исходного тома до выбранной.
- Можно указать новый номер тома (например, собрать всё в `1`, потом
  разделить на `1` и `2`).
- Задание на время редактирования ставится на паузу; после Apply/Cancel —
  возвращается в `running`, если было `running`.

### Что нужно в бэкенде

Добавить endpoint, например:

```http
POST /api/mango/series/:seriesKey/chapters/move
Content-Type: application/json

{
  "chapterIds": ["54646", "54647"],
  "targetVolume": "7"
}
```

Ответ:

```json
{
  "moved": 2,
  "from": "6",
  "to": "7",
  "numbers": ["61", "62"],
  "filesMoved": 2
}
```

Сервер сам должен:

1. Проверить, что все `chapterIds` — из одного исходного тома.
2. Посчитать каскад по тем же правилам (см. `planMove` в `mock-api.js`).
3. Запретить перенос, если по этому тайтлу есть активная загрузка **не в
   паузе**. Лучше: фронт сначала вызывает существующий
   `POST /api/mango/series/:key/pause`, ждёт `paused`, затем move.
4. Для каждой перемещаемой главы:
   - исходная папка:
     `<mangoRoot>/<seriesFolder>/Volume <from>/<chapterFolder>`;
   - целевая:
     `<mangoRoot>/<seriesFolder>/Volume <to>/<chapterFolder>`;
   - если есть `<chapterFolder>.idk-part` — либо отменить/дождаться, либо
     переносить вместе с ним;
   - если целевая папка уже существует — не перезаписывать, вернуть
     конфликт/суффикс;
   - выполнить `fs.rename` (в пределах одного диска) или `cp + rm`;
   - обновить `mango_chapters.volume` и, если нужно, `folder`;
   - обновить `mango_series.updated_at`.
5. Если исходный том опустел — он просто исчезает (папку `Volume N` удалить,
   если пустая).
6. После переноса вернуть актуальные главы/историю, чтобы UI не гадал.
7. Возобновить задание, если оно было на паузе **из-за редактора**. Не
   возобновлять, если пользователь поставил паузу сам.

Файловые операции должны быть идемпотентными: повторный move после сбоя не
должен плодить копии. Хороший вариант — писать в `<chapter>.idk-move`, затем
атомарно переименовывать.

### Что менять в UI

- `mgJobHtml` / `renderMangoHistory` / toolbar — кнопки `Edit volumes`.
- Модалка редактора: `ensureEditor`, `renderEditor`, `applyEditor` в
  `playground-ui.js` → перенести в `app.js` (или отдельный `mango-edit.js`).
- Добавить i18n-ключи `mango.editVolumes`, `mango.moveTo`,
  `mango.moveApply`, `mango.volumeEditTitle`, тексты предпросмотра.
- При открытии задания: `pause`, запомнить `wasRunning`; при закрытии без
  применения — `resume`; после успешного move — `resume`, если было running.

### Ограничения прототипа

- Файлы не двигаются, только считается `filesMoved`.
- Нет проверки коллизий, прав и активного `.idk-part`.
- Нет серверной валидации «том без пропусков» — это делает `planMove` на
  фронте. В бою правило должно быть и на сервере.

## 3. Add by link: резолвер и карточки

**Нужен новый backend-резолвер.**

### Поток

1. Пользователь вставляет ссылку.
2. `POST /api/tasks/preview` (или `/api/resolve`) получает:
   - `url` — файл/тайтл/франшиза/favorites.
3. Сервер возвращает карточки:

```json
{
  "source": "rezka.fi",
  "url": "https://rezka.fi/franchises/…",
  "cards": [
    {
      "id": "shining-1997",
      "title": "Сияние",
      "origTitle": "The Shining",
      "year": "1997",
      "kind": "series",
      "section": "series",
      "rating": "18+",
      "quality": "1080p",
      "qualityOptions": ["Auto", "2160p", "1080p Ultra", "1080p", "720p", "480p"],
      "voiceover": "Дубляж",
      "voiceovers": ["Дубляж", "LostFilm"],
      "subtitles": ["ru"],
      "downloaded": 1,
      "total": 3,
      "episodes": [
        {"id": "s1e1", "season": "1", "episode": "1", "title": "Серия 1", "downloaded": true}
      ]
    }
  ]
}
```

4. Фронт рисует карточки. У каждой:
   - галочка «включить»;
   - качество;
   - озвучка;
   - серии (для сериалов);
   - «Скачать заново»;
   - субтитры `RU · авто` (без отдельной галочки).
5. `POST /api/tasks` массивом — по задаче на выбранный фильм/серию/эпизод.
   Сервер сам добавляет VTT-задачу, если субтитры есть.

### Семантика «Скачать заново»

- Галочка **не стоит** → добавить только то, чего нет в истории/на диске.
- Галочка **стоит** → добавить всё выбранное, даже уже скачанное.
- Полностью скачанный фильм по умолчанию **не выбран**.
- У сериала скачанные эпизоды по умолчанию **не выбраны**.

### Cookies

- В настройках — textarea для Netscape-экспорта.
- На сервере парсить строки в `Cookie` header, хранить в настройках/секрете,
  не логировать и не коммитить.
- Нужно для `favorites` и приватных страниц. Публичные тайтлы/франшизы могут
  работать без cookies.
- В прототипе парсер только считает строки; реального запроса нет.

### Referer

Поле из формы убрано. Сервер должен сам брать referer из URL/источника
(`https://rezka.fi/...`), а не спрашивать пользователя.

## 4. Categories и Library folder

### Убрать `library_dir`

- В настройках больше нет «Library folder».
- `download_dir` — **корень** библиотеки.
- Категории создают подпапки прямо в нём:
  `/home/demo/Downloads/морковные фильмы/…`.
- В `db.js`/настройках `library_dir` можно оставить для миграции, но UI его не
  показывает; `saveDir` = `download_dir`.
- `buildFilename`/`resolveCategory` должны сразу включать папку категории.

### Новый формат правил

Вместо `library_categories` (`section = folder`) — структура:

```json
[
  {"section":"animation","kind":"film","rating":"any","folder":"морковные фильмы"},
  {"section":"cartoons","kind":"series","rating":"18+","folder":"томатные несколькосерий"}
]
```

Правила хранить в настройках/БД, мигрировать старые `library_categories` по
разделу, но новые 16+/18+ правила задать явно.

### Как определять тип

- `section` — из URL/страницы:
  - `/animation/…` → `animation` (аниме, **не** мультик);
  - `/cartoons/…` → `cartoons`;
  - `/films/…` → `films`;
  - `/series/…` → `series`.
- `kind`:
  - есть `season`/`episode` или страница сериала → `series`;
  - один файл/фильм → `film`.
  - **Одного `/animation/` мало**: аниме-фильм и аниме-сериал находятся в одном
    разделе, различие — в метаданных/наличии серий.
- `rating` — `ageRestriction`/`16+`/`18+` из страницы/API.
- Для `cartoons` с `16+`/`18+` выбирать томатные правила **раньше** общих
  банановых.

### Name template: mango

Добавлено поле `filename_template_mango`:

```text
%orig_title%%year_part%/Volume %volume%/%chapter%%chapter_title_part%
```

Плейсхолдеры:

- `%orig_title%` — название тайтла;
- `%year_part%` — ` [2020]` или пусто;
- `%volume%` — номер тома;
- `%chapter%` — номер главы;
- `%chapter_title_part%` — ` - Название` или пусто.

Страницы внутри главы остаются `000.ext` / `0000.ext` (≥1000 страниц).
В боевом коде шаблон должен применяться в `mango/naming.js`/`index.js`, а не
только показываться в настройках.

## 5. Язык

- Кнопки `EN`/`RU` из сайдбара убраны. Язык меняется только в
  `Settings → Interface language`.
- В прототипе новые строки переведены через `pgT(en, ru)` и
  `data-pg-en`/`data-pg-ru`.
- При переносе в боевой `app.js`: добавить строки в `I18N.dict.en` и
  `I18N.dict.ru`, не оставлять русские литералы в шаблонах.
- Проверить: Settings, Add by link, карточки, редактор томов, History,
  Mango, dev-панель (если останется).

## 6. Порядок переноса

1. History-карточки (чистый фронт, низкий риск).
2. Name template mango (настройки + naming).
3. Удаление `library_dir` + новые правила категорий + определение типа.
4. Add by link: preview endpoint, cookies, карточки, семантика force.
5. Редактор томов: сначала UI на моках, затем pause/move files/DB.
6. Переводы и скриншот-тесты.

## 7. Что пока не сделано

- Реальный перенос файлов и `.idk-part`.
- Серверная валидация каскада и коллизий.
- Реальный резолвер Rezka (франшизы, favorites, cookies).
- Миграция `library_categories` → `library_rules`.
- Автоматическое определение `section/kind/rating` из HTML Rezka.
- Полный E2E-тест «скачал → перенёс → перезапустил сервер».

Тесты прототипа: `cd server && npm test` (43 теста) и ручной smoke в
`frontend-playground` через `node serve.mjs`.