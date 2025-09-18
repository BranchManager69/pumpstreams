# Integration Overview

This lane speaks to teams embedding PumpStreams data into dashboards, trading pipelines, or partner products. Treat it as the contract between our platform and anything you build on top of it.

## Reference modules

- [Integration Overview](overview.md) maps every surface—batch exports, webhooks, and real-time feeds—and clarifies when to use each.
- [Realtime Endpoints](realtime-endpoints.md) documents payload schemas, sequencing rules, and replay behavior for the WebSocket streams.
- [Authentication & Access Control](authentication.md) explains key issuance, rotation, scopes, and the rate limits we enforce per client.

## How to engage

1. Start with the overview to confirm the transport that best fits your latency and volume needs.
2. Implement against the realtime endpoint specs or REST alternatives using the provided examples.
3. Coordinate key provisioning through the contacts listed in the auth guide; raise issues here when you need additional scopes or quota.

If an integration requirement is missing, open an issue before writing code so we can extend the spec and keep every consumer in sync.
