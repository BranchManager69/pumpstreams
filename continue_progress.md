# Continue Progress: Stream Schema Cleanup

## Objective
- Remove the unused xtra JSON payload from livestream tables to shrink storage and simplify snapshots.
- Keep the Prisma schema and Supabase/Postgres schema aligned via a dedicated migration.
- Ensure downstream consumers rely on livestream JSON only.

## Current State
- lib/supabase-storage.js and Prisma models drop the xtra column (writes now persist the trimmed payloads).
- Migration supabase/migrations/20250922171120_drop_extra_stream_metadata_trigger.sql drops the column and rebuilds the 	oken_latest_snapshot view / triggers.
- Prisma CLI checks require DATABASE_URL; status is unknown until the env is supplied.

## Next Actions
1. With the correct database URL handy, run DATABASE_URL=... npx prisma migrate status (or supabase db diff/status) to confirm the migration is applied; if not, run it.
2. Regenerate Prisma client (
px prisma generate) after applying the migration so TypeScript clients compile cleanly.
3. Smoke test the functions that touched xtra (persistLivestreamSnapshot, persistLiveRoster) to confirm no callers expect that field.
4. Commit the schema, library, and migration updates on main once validation is complete.