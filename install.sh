#!/usr/bin/env bash
# Copy layouts/*.json and mods/*/ to the herdr-app home
set -euo pipefail
shopt -s nullglob

SRC_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null && pwd)"
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

mkdir -p "$HOME_DIR/layouts" "$HOME_DIR/mods"

for src in "$SRC_DIR"/layouts/*.json; do
  dest="$HOME_DIR/layouts/$(basename "$src")"
  # rsync renames a temp file, so even if dest is a symlink it is replaced with a real file
  rsync -a "$src" "$dest"
  echo "layout: $dest"
done

for src in "$SRC_DIR"/mods/*/; do
  dest="$HOME_DIR/mods/$(basename "$src")"
  # If it stays a symlink, rsync writes through to the link target, so remove it (migration from the old symlink setup)
  if [ -L "$dest" ]; then rm "$dest"; fi
  # --delete only applies inside this mod folder. Exclude the type files the app writes so they are not deleted (do not use --delete-excluded)
  rsync -a --delete --exclude=jsconfig.json --exclude='*.d.ts' "$src" "$dest/"
  echo "mod:    $dest"
done
