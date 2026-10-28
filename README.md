# idk downloader

umm downloader movies from hdrezka/
это ну вообще это сделано на базе
> [kristal374/HDrezka-Grabber](https://github.com/kristal374/HDrezka-Grabber) —

how to laucnh
```bash
cd server && npm install     # одна зависимость: puppeteer-core (для манги)
node server/src/index.js --port 8080
```

Переменные: `PORT`, `HOST`, `DB_FILE`, `DOWNLOAD_DIR`,
`MANGO_DIR`, `CHROMIUM_PATH`, `AUTH_TOKEN`, `FFMPEG_PATH`,
`USER_AGENT`.

Данные по умолчанию `server/data/grabber.db`, загрузки `server/downloads/`.

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
# ~/nixos/Custom/idk/default.nix
{ ... }:
{
  imports = [ ./Custom/idk/module.nix ];

  services.idk-downloader = {
    enable = true;
    port = 8080;                 # порт который вы хотите видеть хз тут например `http://192.168.0.25:8080`
    openFirewall = true;         # открыть чтобы например клиент хз ноутбук другой видел мог типо да
    dataDir = "/idkselfhost/idk-downloader";              # где будет лежать история/настройки
    downloadDir = "/idkselfhost/idk-downloader/downloads"; # куда качать
    extraPackages = [ pkgs.ffmpeg ];                # для .m3u8 (HLS) собирать чтобы
  };
}
```


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
    extraPackages = [ pkgs.ffmpeg ];                # для .m3u8 (HLS) собирать чтобы
  };
}
```

## не  NixOS система хз не тестировалось незнаю

Готовый юнит: `server/deploy/idk-downloader.service`
(скопировать в `/etc/systemd/system/`, поправить `ExecStart`/`User`/пути).
