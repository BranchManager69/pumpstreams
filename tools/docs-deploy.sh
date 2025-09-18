#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BUILD_DIR="$ROOT_DIR/docs/_book"
PUBLISH_DIR="/var/www/docs.dexter.cash"

npm --prefix "$ROOT_DIR" run docs:build

SUDO_CMD=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO_CMD="sudo"
fi

$SUDO_CMD mkdir -p "$PUBLISH_DIR"
$SUDO_CMD rsync -a --delete "$BUILD_DIR/" "$PUBLISH_DIR/"

echo "Docs published to $PUBLISH_DIR"
