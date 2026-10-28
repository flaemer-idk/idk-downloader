{
  description = "idk downloader — расширение и локальный сервер загрузок с веб-мордой";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
    in
    {
      packages = forAllSystems (pkgs: rec {
        idk-downloader = pkgs.callPackage ./nix/package.nix { };
        default = idk-downloader;
      });

      # Проверка сборки пакета: nix flake check
      checks = forAllSystems (pkgs: {
        idk-downloader = self.packages.${pkgs.system}.idk-downloader;
      });

      nixosModules.default = import ./nix/module.nix;
      nixosModules.idk-downloader = self.nixosModules.default;

      overlays.default = final: prev: {
        idk-downloader = final.callPackage ./nix/package.nix { };
      };
    };
}
