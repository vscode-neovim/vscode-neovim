let
  pkgs = import <nixpkgs> {};
in
pkgs.mkShell {
  buildInputs = [
    pkgs.yarn
    pkgs.nodePackages.typescript
    pkgs.nodejs-12_x
  ];
}
