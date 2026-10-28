# idk downloader

umm downloader movies from hdrezka/
это ну вообще это сделано на базе
> [kristal374/HDrezka-Grabber](https://github.com/kristal374/HDrezka-Grabber) —

how to laucnh
```bash
cd server && npm install     # одна зависимость: puppeteer-core (для манги)
node server/src/index.js --port 8080
```

Переменные: `PORT`, `HOST`, `DB_FILE`,
`DOWNLOAD_DIR`, `LIBRARY_DIR` (начальное значение папки медиатеки),
`MANGO_DIR` (начальное значение папки манги), `CHROMIUM_PATH` (браузер только
для com-x.life; MangaDex и MangaLib идут через API), `AUTH_TOKEN`, `FFMPEG_PATH`,
`USER_AGENT`.

Данные по умолчанию: база — `server/data/grabber.db`, загрузки — `server/downloads/`.

## Манга

Во вкладке «Манга» веб-морды вставляете ссылку на тайтл с **com-x.life**,
**MangaDex** или **MangaLib** и жмёте «Добавить». MangaDex и MangaLib
разбираются через API (без браузера); com-x.life — через **безголовый Chromium**
(антибот DleGuard пропускает только настоящий браузер — расширение и cookies не
нужны, можно хоть с телевизора). Chromium запускается лениво, только на время
разбора страницы com-x.life: при старте `node` браузер не поднимается и в памяти
не висит. Дальше — главы с галочками и скачивание выбранных. У MangaDex есть
языковые чипы: набор языков приходит из API, по умолчанию русский, а главы не
на русском получают суффикс `[en]`, чтобы не смешиваться с русскими. Сам
`mangadex.org` при этом не нужен: адаптер ходит только на `api.mangadex.org` и
CDN, поэтому блокировка сайта не мешает. MangaLib работает через
`api.imglib.info` (резерв — `api.cdnlibs.org`), картинки — с `img3.cdnlibs.org`
и зеркал.

Структура на диске:

```
Манга/Суи и Нери с закатной планеты [2020]/
├── Volume 1/
│   ├── 1/
│   │   ├── 000.webp
│   │   └── 001.webp
│   ├── 1 [en]/                 ← MangaDex, не русский язык
│   └── 2.5 - Экстра/
└── Volume 2/12/
```

Обложку (`Cover.png`) в папку тайтла кладёте сами — программа её не качает и не
трогает. Уже скачанные главы пропускаются (по истории и по папке на диске); если
выбрано только скачанное — будет предупреждение. Chromium берётся системный
(`CHROMIUM_PATH` или поиск по типовым путям/PATH): на NixOS он уже есть, в
модуле ставится автоматически; но он нужен только com-x.life. Подробности и
дизайн — [`mango.md`](mango.md) (исторический прототип —
`prototypes/mango/mango.md`).

## Полигон для дизайна

[`frontend-playground/`](frontend-playground/) — отдельная полная копия
веб-морды с демо-данными и без бэкенда. Нужна, чтобы спокойно менять дизайн,
историю, добавлять новые вкладки и не ломать рабочий интерфейс. Внутри уже
есть очередь, история, Mango и настройки, редактор томов с переносом глав и
каскадом (как в сценарии MangaLib: том 6 — 12 глав, том 7 — 8), новые правила
Categories с 16+/18+ и макет Rezka cookies. Add by link разбирает франшизу или
закладки в карточки с качеством, озвучкой, сериями и «скачать заново».

```bash
cd frontend-playground
node serve.mjs
# http://127.0.0.1:4173/
```

Подробности — в [`frontend-playground/README.md`](frontend-playground/README.md),
план переноса в боевой код — в
[`frontend-playground/PORTING.md`](frontend-playground/PORTING.md).

## Расширение
1. Chrome/Edge/Opera: `chrome://extensions` → «Режим разработчика» → «Загрузить
   распакованное расширение» → папка `client-extension/`.
   Firefox: `about:debugging#/runtime/this-firefox` → «Загрузить временное
   дополнение» → `client-extension/manifest.json`. но я хз в файрфоксе инет нельзя наверное
2. В расширения напишите адрес сервера, например `http://192.168.1.25:8080` короче свой адрес я хз незнаю шо будет на `https://192.168.0.25:8080` или на `http://idk-downloader.idk` или на http/https и внешний не локальный.

## NixOS

`nix/idk-downloader.nix` — самодостаточный модуль: сам скачивает исходники с
GitHub (`fetchFromGitHub`) и сам собирает пакет. Флейки не нужны — просто
скопируйте файл в свой конфиг: 
я хз где у вас он например и как у вас устроены директории как хотите например

```bash
cp nix/idk-downloader.nix ~/nix/Custom/idk/module.nix
```

и подключите так типо:

```nix
# ~/nixos/Custom/idk/default.nix (или где у вас список импортов)
{ ... }:
{
  imports = [ ./Custom/idk/module.nix ];

  services.idk-downloader = {
    enable = true;
    port = 8080;                 # порт который вы хотите видеть хз тут например `http://192.168.0.25:8080`
    openFirewall = true;         # открыть чтобы например клиент хз ноутбук другой видел мог типо да
    dataDir = "/idkselfhost/idk-downloader";              # где будет лежать история/настройки
    downloadDir = "/idkselfhost/idk-downloader/downloads"; # куда качать
    libraryDir = "/idkselfhost/Media";              # качать сразу в медиатеку опционально я хз зачем уберется потом 
    extraPackages = [ pkgs.ffmpeg ];                # для .m3u8 (HLS) собирать чтобы
  };
}
```

Модуль создаёт системного пользователя `idk-downloader`, каталоги, systemd-сервис
с ограничениями (`ProtectSystem=strict`, `ReadWritePaths` только на свои папки) и
открывает порт в фаерволе при `openFirewall = true`.

## Nix снежинки flakes 

```bash
nix run .#idk-downloader -- --port 8080   # запустить без установки
nix build .#idk-downloader                # собрать пакет
```

Подключение модуля во флейк-конфиге - два шага: инпут и модуль в `modules`:

```nix
# flake.nix
{
  inputs.idk-downloader = {
    url = "github:flaemer-idk/idk-downloader";
    inputs.nixpkgs.follows = "nixpkgs";   # собирать на вашем nixpkgs
  };

  outputs = { self, nixpkgs, idk-downloader, ... }: {
    nixosConfigurations.myhost = nixpkgs.lib.nixosSystem {
      modules = [
        ./configuration.nix
        idk-downloader.nixosModules.default   # services.idk-downloader
      ];
    };
  };
}
```

```nix
# configuration.nix
{ pkgs, ... }:
{
  services.idk-downloader = {
    enable = true;
    port = 8080;                 # порт который вы хотите видеть хз тут например `http://192.168.0.25:8080`
    openFirewall = true;         # открыть чтобы например клиент хз ноутбук другой видел мог типо да
    dataDir = "/idkselfhost/idk-downloader";              # где будет лежать история/настройки
    downloadDir = "/idkselfhost/idk-downloader/downloads"; # куда качать
    libraryDir = "/idkselfhost/Media";              # качать сразу в медиатеку опционально я хз зачем уберется потом 
    extraPackages = [ pkgs.ffmpeg ];                # для .m3u8 (HLS) собирать чтобы
  };
}
```

## не  NixOS система хз не тестировалось кстати

Готовый юнит: `server/deploy/idk-downloader.service`
(скопировать в `/etc/systemd/system/`, поправить `ExecStart`/`User`/пути).
