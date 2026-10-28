# Mango (манга-качалка): исследование готовых решений и источников

> Снимок исследования от 2026-10-25 (сделан суб-агентом по открытым источникам).
> Архитектура серверной части **ещё не решена** — ниже факты и рекомендация исследования,
> не принятое решение. Прототип дизайна: [prototype.html](./prototype.html).
> Целевые источники: ComX (com-x.life, RU) и MangaDex. Домен `comx.life` при проверке
> не резолвился (curl 000) — актуальные зеркала по данным расширений: `com-x.life`
> и `ru.com-x.life` (уточнить при реализации).

## Готовые качалки: сводка

| Название | Ссылка | Стек | Источники | Активность | Лицензия | Вес/зависимости | Встраивание в Node | Заметки |
|---|---|---|---|---|---|---|---|---|
| comx-downloader (smutchev) | github.com/smutchev/comx-downloader | Python: requests + cloudscraper + **Selenium/webdriver-manager** | только com-x.life | последний коммит 06.2026 (8★) | MIT | реальный Chrome/Firefox нужен для первичного логина (cookies → `comx_cookies.json`), дальше cloudscraper | сабпроцесс (тянет Python + браузер) | главы+картинки из `window.__DATA__`, распаковка .cbr/.zip, выход `Manga/Тайтл/Vol. X Ch. Y/001.jpg`, есть CBZ, диапазоны глав, кэш |
| comx-downloader (форк Forsash3451k) | github.com/Forsash3451k/comx-downloader | Python: Selenium **только для первого логина**, дальше requests + bs4 + cloudscraper | только com-x.life (+ зеркало rus.com-x.life) | **активен: коммиты 22–23.09.2026**, 19 коммитов | MIT | после логина чистый HTTP, браузер не нужен | сабпроцесс; лучше — как **референс** для переписывания | ключевой фикс: парсинг глав и картинок напрямую из `window.__DATA__` (у оригинала кнопка «Скачать»/API сломалась). Маркеры `.complete`, валидация, выбор хоста картинок из `__DATA__` |
| HakuNeko / HaruNeko | github.com/manga-download/hakuneko (старый), актуальный — **github.com/manga-download/haruneko** | старый: JS + Electron/NW.js; HaruNeko: TypeScript + Vite + Electron/NW.js, ноль runtime-зависимостей | ~885 провайдеров в haruneko: MangaDex, ReadManga/MintManga/SelfManga (Grouple), Remanga, Desu и др. **ComX — нет** | hakuneko: релиз v6.1.7 (ещё 2020), push 03.2026; haruneko: push 25.10.2026 (активен) | Unlicense | тяжёлый: Electron/NW.js-приложение (~200 МБ), GUI; headless/web-серверного режима нет | практически нереально (desktop-приложение) | провайдеры — простые TS-классы поверх `FetchProvider` (чистый HTTP), `MangaDex.ts` использует официальный API; хорош как архитектурный референс |
| Kaizoku | github.com/oae/kaizoku | TypeScript/Next.js + Prisma (PostgreSQL) + Redis (BullMQ) + бинарник mangal как движок | через mangal (MangaDex, Manganato и т.д.) | **ЗААРХИВИРОВАН**, последний push 02.2025 | MIT | Docker + Postgres + Redis — самостоятельный сервис, не библиотека | не встраивать | подписки на обновления, Komga/Kavita-интеграция |
| Kaizoku форки | ElryGH/kaizoku-next; maxpiva/Rensaio | kaizoku-next — тоже архив; Rensaio — C#, GPL-3.0 | — | Rensaio активен (09.2026) | GPL-3.0 | «series manager», не встраиваемая либа | нет | — |
| mangadex-downloader | github.com/mansuf/mangadex-downloader | Python 3.10+ CLI, чистый HTTP к официальному API MangaDex | только MangaDex | 933★, релиз v3.1.4 (05.2025), push 02.2026 | MIT | лёгкий, без браузера | сабпроцесс (`mangadex-downloader <url>`) | самый функциональный MD-клиент: выбор **языка глав**, диапазоны, фильтры по группам/юзерам, batch, форматы CBZ/PDF/EPUB, уважает rate limit |
| mangal | github.com/metafates/mangal | Go, монолитный бинарник, ноль зависимостей (встроенный Lua) | MangaDex, Manganelo, Manganato, Mangapill + Lua-скраперы (есть Readmanga; **ComX — нет**) | **не поддерживается с апреля 2025** (заявление мейнтейнера в README) | MIT | минимальный | сабпроцесс (лучшая CLI по UX, но проект мёртв) | на нём был построен Kaizoku |
| manga-dlp | github.com/olofvndrhr/manga-dlp | Python 3.11, CLI, чистый HTTP | только MangaDex | релиз 02.2024, push 01.2026 (26★) | MIT | лёгкий | сабпроцесс | язык глав, диапазоны, CBZ/CBR/zip, ComicInfo.xml, хуки |
| Keiyoushi extension «Com-X» (не качалка — главный референс) | github.com/keiyoushi/extensions-source → `src/ru/comx` | Kotlin (Mihon/Tachiyomi), OkHttp — чистый HTTP + WebView **только** для обхода DleGuard | com-x.life + зеркало ru.com-x.life | активен (versionCode 42, репо пушится ежедневно) | Apache-2.0 | лёгкий | не встраивается (Android), но это **готовый клиент ComX для переписывания на Node** | см. рецепт ниже; отвечает на вопрос «есть ли у ComX API» |

## Как устроен ComX (рецепт, отработанный в трёх независимых реализациях)

- Публичного JSON-API **не найдено** (ни в issues, ни в обсуждениях). Сайт работает на
  **DataLife Engine (DLE)** с антибот-модулем **DleGuard**: запрос редиректится на `/_c?t=...`
  (подтверждено живым curl: 302 → `/_c?...`), после решения JS-челленджа ставится cookie
  `__guard_trust`.
- Все три реализации используют один паттерн:
  1. одноразовая сессия с cookie (DleGuard `__guard_trust` решается один раз — через реальный
     браузер, как в форке Forsash3451k, либо headless-Chrome только при первом логине);
  2. GET страниц читалки, парсинг JSON-блоба **`window.__DATA__`** (список глав и пути картинок);
  3. картинки: `https://{host}/comix/{path}`, где host берётся из полей `host`/`hostRu` внутри
     `__DATA__` → `img.com-x.life` (глобально) или `rus.com-x.life` (для РФ).
- Поиск/каталоги — DLE-эндпоинты: `/search/{query}`, `/ComicList`, POST с `dlenewssortby` и т.п.
- Keiyoushi-расширение дополнительно ставит `rateLimit(3)` запроса/сек и решает DleGuard через
  WebView один раз, дальше работает на cookies.
- Файл `src/ru/comx/.../ComX.kt` в Keiyoushi — лучший источник правды по эндпоинтам и краевым
  случаям (фильтры, зеркала, кодировка дат).

## MangaDex API v5 (проверено живыми вызовами)

- Открыт и бесплатен, **ключа не требует** (`GET /manga?title=...` вернул 200 без авторизации;
  OpenAPI-спека 5.13.1).
- Выбор языка глав — параметр `translatedLanguage[]` на `/manga/{id}/feed` (проверено, параметр
  принимается), плюс фильтры по группам/языкам.
- Обложки: relationship `cover_art` у манги + эндпоинт `/covers`; страницы:
  `/at-home/server/{chapterId}` (вернул `baseUrl` и hash, отдаёт по зеркалам mangadex.network).
- Rate limit: **~5 запросов/сек на IP** (не точное значение), при игнорировании 429 — временный
  бан IP (403).
- Требования AUP: обязателен кредит MangaDex и сканлейт-групп; нельзя строить на этом
  платный/рекламный сервис.

## Рекомендация исследования (не принятое решение)

- Из готового ближе всего **mangadex-downloader** (сабпроцесс), но он только Python-CLI и не
  закрывает ComX; Kaizoku/Rensaio и HakuNeko — самостоятельные тяжёлые приложения
  (Docker+Postgres+Redis / Electron), mangal и форки Kaizoku мертвы или не подходят по стеку.
- Поэтому для связки **ComX + MangaDex исследование предлагает написать свой тонкий клиент на
  Node** (~300–500 строк на fetch/cheerio в том же Node-процессе, где живёт hdrezka-качалка,
  без сторонних рантаймов и браузеров в постоянной работе):
  - MangaDex — официальный открытый API (fetch + уважение ~5 rps, `translatedLanguage[]`,
    covers, at-home);
  - ComX — рецепт выше (одноразовая DleGuard-сессия + `window.__DATA__` + хосты картинок),
    референс — `ComX.kt` из Keiyoushi и код форка Forsash3451k;
  - атрибуцию источника и сканлейт-групп заложить в метаданные скачиваний сразу (AUP MangaDex).
- ⚠️ Итоговая архитектура (где живёт парсер, как хранятся главы, структура папок, очередь)
  **на момент записи не определена** — этот файл фиксирует только результаты разведки.
