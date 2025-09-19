#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
cd "${REPO_ROOT}"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    source "$file"
    set +a
    return 0
  fi
  return 1
}

loaded=0
if load_env_file "${REPO_ROOT}/.env.remote"; then
  loaded=1
fi
if load_env_file "${REPO_ROOT}/.env"; then
  loaded=1
fi

if [[ "$loaded" -eq 0 ]]; then
  echo "[prisma.sh] No .env or .env.remote found" >&2
  exit 1
fi

BASE_SESSION_URL="${DATABASE_URL_SESSION:-${DATABASE_URL:-}}"
if [[ -z "${BASE_SESSION_URL}" ]]; then
  echo "[prisma.sh] DATABASE_URL_SESSION or DATABASE_URL must be defined" >&2
  exit 1
fi

if [[ "${BASE_SESSION_URL}" == *":6543"* ]]; then
  echo "[prisma.sh] Refusing to run migrations against the transaction pooler (port 6543)." >&2
  echo "Set DATABASE_URL_SESSION to the Supabase session pooler URI (port 5432)." >&2
  exit 1
fi

append_param() {
  local url="$1"
  local param="$2"
  if [[ "$url" == *"?"* ]]; then
    echo "${url}&${param}"
  else
    echo "${url}?${param}"
  fi
}

export DATABASE_URL="$(append_param "${BASE_SESSION_URL}" "sslmode=require")"

ENGINE_PATH="${REPO_ROOT}/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node"
if [[ ! -f "${ENGINE_PATH}" ]]; then
  echo "[prisma.sh] Prisma engine missing at ${ENGINE_PATH} (run npm install?)" >&2
  exit 1
fi
export PRISMA_QUERY_ENGINE_LIBRARY="${ENGINE_PATH}"

exec npx prisma "$@"
