# Agent Guide

This repo is used with OpenAI Codex Cloud environments. The steps below tell the
agent how to prepare tooling, install dependencies, and run checks. Humans can
follow the same steps locally if they want to mimic the Codex environment.

## Setup

```bash
# Install root dependencies
npm install

# Install dashboard (Next.js) dependencies
cd dashboard
npm install
cd ..
```

The project expects Node.js 20+. The default `universal` Codex image already has
Node 20. If you change the required version, update the environment settings.

## Tests & Checks

```bash
# Lint + unit tests (uses live API smoke by default)
npm test

# Build dashboard (useful to make sure the Next.js app compiles)
cd dashboard
npm run build
cd ..
```

## Notes

- We currently rely on Supabase credentials defined via environment variables.
  In Codex Cloud, set the following as secrets or env vars before running tasks:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and
  optionally `SUPABASE_DB_URL`.
- The dashboard uses port `3050` in production. When running `npm run dev` for
  local/HMR work, use a different port (for example `npm run dev -- --port 3051`)
  to avoid conflicting with the PM2 process.
- The repository contains an optional `codex/setup.sh` helper to install
  dependencies when Codex caches the container. You can leave the default
  automatic install on, but having the script keeps cache hits up to date.
