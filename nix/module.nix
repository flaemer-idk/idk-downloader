# NixOS-модуль: services.idk-downloader (вариант для флейков).
# Если флейки не используются — возьмите `nix/idk-downloader.nix`: это
# самодостаточный модуль, который сам скачивает исходники с GitHub.
#
# Пример подключения (flake):
#   imports = [ inputs.idk-downloader.nixosModules.default ];
#   services.idk-downloader = {
#     enable = true;
#     port = 8081;
#     openFirewall = true;
#     downloadDir = "/mnt/media/downloads";
#     libraryDir = "/mnt/media/Jellyfin";      # начальное значение, дальше правится в веб-морде
#     extraPackages = [ pkgs.ffmpeg ];          # чтобы качались .m3u8 (HLS)
#   };
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.idk-downloader;
  inherit (lib) mkEnableOption mkIf mkOption types;

  dataDirDefault = "/var/lib/idk-downloader";
in
{
  options.services.idk-downloader = {
    enable = mkEnableOption "idk downloader — сервер загрузок с веб-мордой";

    package = mkOption {
      type = types.package;
      default = pkgs.callPackage ../nix/package.nix { };
      defaultText = lib.literalExpression "pkgs.callPackage ./nix/package.nix { }";
      description = "Пакет сервера (по умолчанию собирается из этого репозитория).";
    };

    port = mkOption {
      type = types.port;
      default = 8080;
      description = "Порт веб-морды и API.";
    };

    host = mkOption {
      type = types.str;
      default = "0.0.0.0";
      description = "Адрес прослушивания.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Открыть порт в фаерволе (нужно, чтобы расширение с ноутбука видело сервер).";
    };

    user = mkOption {
      type = types.str;
      default = "idk-downloader";
      description = "Пользователь, от которого работает сервис.";
    };

    group = mkOption {
      type = types.str;
      default = "idk-downloader";
      description = ''
        Группа сервиса. Если медиатека лежит в общей папке (например, для Jellyfin),
        укажите ту же группу, что у медиасервера.
      '';
    };

    dataDir = mkOption {
      type = types.str;
      default = dataDirDefault;
      description = "Каталог с базой данных (история задач и настройки).";
    };

    downloadDir = mkOption {
      type = types.str;
      default = "${dataDirDefault}/downloads";
      description = "Каталог загрузок.";
    };

    libraryDir = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = ''
        Каталог медиатеки: если задан, файлы качаются сразу туда (начальное значение,
        потом можно поменять в веб-морде). Категории (Фильмы/Сериалы/Аниме/…)
        настраиваются там же.
      '';
    };

    environmentFile = mkOption {
      type = types.nullOr types.path;
      default = null;
      example = "/run/secrets/idk-downloader.env";
      description = ''
        Файл окружения systemd — удобно для секретов, например:
        `AUTH_TOKEN=секрет` (тогда тот же токен нужно вписать в расширении).
      '';
    };

    extraEnvironment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      example = { FFMPEG_PATH = "/run/current-system/sw/bin/ffmpeg"; };
      description = "Дополнительные переменные окружения сервиса.";
    };

    extraPackages = mkOption {
      type = types.listOf types.package;
      default = [ ];
      example = lib.literalExpression "[ pkgs.ffmpeg ]";
      description = "Пакеты в PATH сервиса (например, ffmpeg для HLS/.m3u8).";
    };

    extraServiceConfig = mkOption {
      type = types.attrs;
      default = { };
      description = "Дополнительные настройки systemd-сервиса.";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.user != "root";
        message = "services.idk-downloader.user: не запускайте сервер от root.";
      }
    ];

    users.users."${cfg.user}" = {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.dataDir;
      description = "idk downloader";
    };
    users.groups."${cfg.group}" = { };

    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir} 0750 ${cfg.user} ${cfg.group} -"
      "d ${cfg.downloadDir} 0750 ${cfg.user} ${cfg.group} -"
    ] ++ lib.optional (cfg.libraryDir != null) "d ${cfg.libraryDir} 0775 ${cfg.user} ${cfg.group} -";

    systemd.services.idk-downloader = {
      description = "idk downloader";
      documentation = [ "https://github.com/flaemer-idk/idk-downloader" ];
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      path = cfg.extraPackages;

      environment = {
        PORT = toString cfg.port;
        HOST = cfg.host;
        DB_FILE = "${cfg.dataDir}/grabber.db";
        DOWNLOAD_DIR = cfg.downloadDir;
      } // lib.optionalAttrs (cfg.libraryDir != null) {
        LIBRARY_DIR = cfg.libraryDir;
      } // cfg.extraEnvironment;

      serviceConfig = {
        Type = "simple";
        ExecStart = lib.getExe cfg.package;
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.dataDir;
        Restart = "on-failure";
        RestartSec = 5;
        EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;
        RequiresMountsFor = [ cfg.downloadDir ] ++ lib.optional (cfg.libraryDir != null) cfg.libraryDir;

        # Ограничения доступа (серверу нужен только сеть и свои каталоги)
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectKernelTunables = true;
        ProtectControlGroups = true;
        RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
        CapabilityBoundingSet = "";
        ReadWritePaths = [ cfg.dataDir cfg.downloadDir ]
          ++ lib.optional (cfg.libraryDir != null) cfg.libraryDir;
      } // cfg.extraServiceConfig;
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];
  };
}