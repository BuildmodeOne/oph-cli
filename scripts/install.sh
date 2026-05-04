#!/usr/bin/env bash
set -euo pipefail

# Redirect to the PowerShell installer when running under Git Bash on Windows
if [[ ${OS:-} = Windows_NT ]]; then
  powershell -c "irm https://raw.githubusercontent.com/BuildmodeOne/oph-cli/master/scripts/install.ps1 | iex"
  exit $?
fi

GH_REPO="https://github.com/BuildmodeOne/oph-cli"
VERSION="${1:-latest}"

platform=$(uname -s)
arch=$(uname -m)

case "$platform" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *) echo "Unsupported platform: $platform"; exit 1 ;;
esac

case "$arch" in
  x86_64)          cpu="x64" ;;
  aarch64 | arm64) cpu="arm64" ;;
  *) echo "Unsupported architecture: $arch"; exit 1 ;;
esac

target="oph-${os}-${cpu}"

if [[ $VERSION == "latest" ]]; then
  URL="$GH_REPO/releases/latest/download/$target"
else
  TAG="${VERSION#v}"
  URL="$GH_REPO/releases/download/v${TAG}/$target"
fi

INSTALL_DIR="${OPH_INSTALL:-$HOME/.oph}/bin"
EXE="$INSTALL_DIR/oph"

mkdir -p "$INSTALL_DIR"

echo "Downloading oph from $URL..."
curl --fail --location --progress-bar --output "$EXE" "$URL" ||
  { echo "Download failed from $URL"; exit 1; }

chmod +x "$EXE"

INSTALLED_VERSION="$("$EXE" --version 2>&1)"
echo "oph $INSTALLED_VERSION installed to $EXE"

# Shell profile PATH injection
add_to_profile() {
  local profile="$1"
  local snippet="$2"
  if [[ -f $profile ]] && grep -qF 'OPH_INSTALL' "$profile" 2>/dev/null; then
    return
  fi
  if [[ -w $profile ]]; then
    printf '\n%s\n' "$snippet" >> "$profile"
    echo "Added oph to PATH in $profile"
  fi
}

EXPORT_DIR="${OPH_INSTALL:-\$HOME/.oph}/bin"

case $(basename "${SHELL:-bash}") in
  fish)
    FISH_CFG="$HOME/.config/fish/config.fish"
    mkdir -p "$(dirname "$FISH_CFG")"
    add_to_profile "$FISH_CFG" \
      "set --export OPH_INSTALL \$HOME/.oph
set --export PATH \$OPH_INSTALL/bin \$PATH"
    ;;
  zsh)
    add_to_profile "$HOME/.zshrc" \
      "export OPH_INSTALL=\"\$HOME/.oph\"
export PATH=\"\$OPH_INSTALL/bin:\$PATH\""
    ;;
  *)
    for cfg in "$HOME/.bash_profile" "$HOME/.bashrc"; do
      if [[ -w $cfg ]]; then
        add_to_profile "$cfg" \
          "export OPH_INSTALL=\"\$HOME/.oph\"
export PATH=\"\$OPH_INSTALL/bin:\$PATH\""
        break
      fi
    done
    ;;
esac

echo ""
echo "Restart your terminal, then run: oph --help"
