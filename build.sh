#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TAURI_CACHE="${TAURI_CACHE_DIR:-$HOME/.cache/tauri}"

# Ensure linuxdeploy AppImages in Tauri's cache are executable (downloads often create 0644).
fix_linuxdeploy_cache() {
  if [[ -d "$TAURI_CACHE" ]]; then
    find "$TAURI_CACHE" -type f \( -name '*.AppImage' -o -name 'AppRun-*' \) -exec chmod +x {} \; 2>/dev/null || true
  fi
}

export ARCH=x86_64
export APPIMAGE_EXTRACT_AND_RUN=1
export NO_STRIP=1

echo "Building Bruh (frontend + Tauri)..."
fix_linuxdeploy_cache

if ! npm run tauri build; then
  echo "AppImage step may have failed due to linuxdeploy permissions or FUSE; fixing cache and retrying..."
  fix_linuxdeploy_cache
  npm run tauri build
fi

echo ""
echo "Build finished. Bundles:"
echo "  $SCRIPT_DIR/src-tauri/target/release/bundle/"
