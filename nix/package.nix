# Упаковка сервера idk downloader для Nix.
# Зависимостей нет: нужен только Node.js (используется встроенный node:sqlite),
# поэтому сборка сводится к копированию файлов и обёртке-лаунчеру.
{
  lib,
  stdenv,
  nodejs,
  makeWrapper,
  ffmpeg ? null,
}:

let
  packageJson = lib.importJSON ../server/package.json;
in
stdenv.mkDerivation (finalAttrs: {
  pname = "idk-downloader";
  version = packageJson.version;

  # Только то, что нужно серверу: без тестов, логов, базы, загрузок и node_modules.
  # Каталоги перечислены отдельно — иначе фильтр отсекает их вместе с содержимым.
  src = lib.sourceByRegex ../server [
    "^package\\.json$"
    "^README\\.md$"
    "^src$"
    "^src/.*$"
    "^public$"
    "^public/.*$"
  ];

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/idk-downloader $out/bin
    cp -r package.json README.md src public $out/share/idk-downloader/

    # Обёртка: запускает node с сервером и задаёт разумные пути по умолчанию,
    # чтобы `nix run` работал без предварительной настройки (в Store писать нельзя).
    makeWrapper ${lib.getExe nodejs} $out/bin/idk-downloader \
      --add-flags "$out/share/idk-downloader/src/index.js" \
      --run 'export DB_FILE="''${DB_FILE:-''${XDG_STATE_HOME:-$HOME/.local/state}/idk-downloader/grabber.db}"' \
      --run 'export DOWNLOAD_DIR="''${DOWNLOAD_DIR:-''${XDG_DOWNLOAD_DIR:-$HOME/Downloads}/idk-downloader}"' \
      ${lib.optionalString (ffmpeg != null) ''--prefix PATH : ${lib.makeBinPath [ ffmpeg ]}''}

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
