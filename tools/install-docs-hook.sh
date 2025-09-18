#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MERGE_HOOK="$ROOT_DIR/.git/hooks/post-merge"
HOOK_PATH="$ROOT_DIR/.git/hooks/post-commit"

rm -f "$MERGE_HOOK"

cat > "$HOOK_PATH" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail

# Only deploy when we're on the main branch and the docs publish target exists
BRANCH=$(git rev-parse --abbrev-ref HEAD)
PUBLISH_DIR="/var/www/docs.dexter.cash"

if [[ "$BRANCH" != "main" ]]; then
  exit 0
fi

if [[ ! -d "$PUBLISH_DIR" ]]; then
  exit 0
fi

# Exit unless the latest commit touched docs or the README
if ! git diff-tree --no-commit-id --name-only -r HEAD | grep -Eq '^(docs/|README.md$)'; then
  exit 0
fi

echo "[docs] docs commit detected on main; publishing Honkit build"
# Run from repo root
dirname="$(git rev-parse --show-toplevel)"
cd "$dirname"

npm run docs:deploy
HOOK

chmod +x "$HOOK_PATH"

echo "Installed post-commit docs deploy hook at $HOOK_PATH"
