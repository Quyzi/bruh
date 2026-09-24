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
# /tmp is mounted noexec here; linuxdeploy's AppImage runtime (Tauri forces
# --appimage-extract-and-run) extracts to $TMPDIR, so point it at an
# executable location or bundling fails with "failed to run linuxdeploy".
BUILD_TMP="${BRUH_BUILD_TMP:-$HOME/.cache/bruh-build-tmp}"
mkdir -p "$BUILD_TMP"
export TMPDIR="$BUILD_TMP"
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
