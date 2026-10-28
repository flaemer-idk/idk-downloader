# Упаковка сервера idk downloader для Nix.
# Встроенный node:sqlite (Node >= 22.5) + одна npm-зависимость puppeteer-core
# (клиент к системному Chromium для манга-источников), поэтому сборка через
# buildNpmPackage; Chromium ставится отдельно и попадает в PATH обёртки.
{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
  chromium ? null,
  ffmpeg ? null,
}:

let
  packageJson = lib.importJSON ../server/package.json;
in
buildNpmPackage (finalAttrs: {
  pname = "idk-downloader";
  version = packageJson.version;

  # Только то, что нужно серверу: без тестов, логов, базы, загрузок и node_modules.
  # Каталоги перечислены отдельно — иначе фильтр отсекает их вместе с содержимым.
  src = lib.sourceByRegex ../server [
    "^package\\.json$"
    "^package-lock\\.json$"
    "^README\\.md$"
    "^src$"
    "^src/.*$"
    "^public$"
    "^public/.*$"
  ];

  inherit nodejs;
  npmDepsHash = "sha256-8ZRfxkTtCQoWw8pwY03+BGxLuxjz4xqU6HChfZ7QkRM=";
  dontNpmBuild = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/idk-downloader $out/bin
    cp -r package.json package-lock.json node_modules src public README.md $out/share/idk-downloader/

    # Обёртка: запускает node с сервером и задаёт разумные пути по умолчанию,
    # чтобы `nix run` работал без предварительной настройки (в Store писать нельзя).
    makeWrapper ${lib.getExe nodejs} $out/bin/idk-downloader \
      --add-flags "$out/share/idk-downloader/src/index.js" \
      --run 'export DB_FILE="''${DB_FILE:-''${XDG_STATE_HOME:-$HOME/.local/state}/idk-downloader/grabber.db}"' \
      --run 'export DOWNLOAD_DIR="''${DOWNLOAD_DIR:-''${XDG_DOWNLOAD_DIR:-$HOME/Downloads}/idk-downloader}"' \
      --prefix PATH : ${
        lib.makeBinPath (
          lib.optional (ffmpeg != null) ffmpeg ++ lib.optional (chromium != null) chromium
        )
      }

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    $out/bin/idk-downloader --version | grep -q ${finalAttrs.version}
    $out/bin/idk-downloader --help | grep -q -- '--port'
    runHook postInstallCheck
  '';

  meta = {
    description = "Локальный сервер загрузок с веб-мордой (качает файлы на сервер, а не в браузер). Основан на HDrezka-Grabber от kristal374";
    homepage = "https://github.com/flaemer-idk/idk-downloader";
    license = lib.licenses.gpl3Only;
    mainProgram = "idk-downloader";
    platforms = lib.platforms.all;
  };
})
