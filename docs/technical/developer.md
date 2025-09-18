# Developer Guide

The developer track explains how the codebase is structured, how we work locally, and how to extend the platform.

## Repository Layout

- `cli/` – realtime ingestion and monitoring tools
- `dashboard/` – Next.js dashboard served over port 3050 in production
- `lib/` – shared utilities used across the CLI entry points
- `supabase/` – database migrations and seed helpers
- `docs/` – this GitBook-style documentation (Honkit powered)

## Local Development Basics

- Copy `.env.example` to `.env` and fill in Supabase credentials
- Use `npm run monitor` to stream live websocket data
- Run `npm test` before pushing to catch regressions

## Extending the Docs

Add new topics by creating Markdown files inside `docs/` and linking them from `docs/SUMMARY.md`. Honkit automatically rebuilds the sidebar based on that file, so you get navigation for free.

If you want a separate GitBook for API consumers or partners, duplicate the directory structure under a dedicated folder (for example `docs-api/`) and add matching npm scripts.
