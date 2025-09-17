#!/usr/bin/env bash
set -euo pipefail

# Root dependencies
npm install

# Dashboard dependencies
if [ -d dashboard ]; then
  pushd dashboard >/dev/null
  npm install
  popd >/dev/null
fi
