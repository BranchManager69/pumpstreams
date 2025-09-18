# Operations Playbook

This section collects everything the on-call team needs to keep PumpStreams healthy.

## Daily Checklist

- Confirm PM2 processes are healthy: `pm2 status`
- Review logs for anomalies in `logs/` (especially the websocket collectors)
- Validate Supabase connectivity with `npm run smoke`
- Run `npm run docs:deploy` if there were documentation changes to publish (automatic after committing to `main` when `tools/install-docs-hook.sh` has been run)

## Incident Response

1. Capture the current state (logs, metrics, recent deploys)
2. Escalate to the engineering channel if the issue touches ingestion or real-time streaming
3. Document remediation steps here once resolved so the fix becomes part of the playbook

## Deploying Documentation Updates

- Merge the latest Markdown changes into `main`
- Run `npm run docs:deploy` (builds + rsyncs to `/var/www/docs.dexter.cash/`)
- No Nginx reload is needed for content updates; the files are served directly from that path

Keep this page evolving—treat it like a runbook where new scenarios are documented immediately after you handle them.
