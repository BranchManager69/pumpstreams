# Integration Overview

This track covers how external partners plug into PumpStreams.

- **Realtime firehose:** choose between WebSocket subscriptions, LiveKit rooms, or REST snapshots depending on latency and payload needs.
- **Security model:** keys live in Supabase and are scoped per partner; rate limits and attribution headers are enforced at the edge.
- **Roadmap:** webhooks for trade events, signed playback URLs, and cross-project federation are slated for Q4.

Use this page as the launchpad—each subchapter goes deeper into the protocols, authentication, and sample code you will need in production.
