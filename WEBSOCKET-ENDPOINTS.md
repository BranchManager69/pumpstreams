# Pump.fun Realtime + Livestream Endpoints

This document reflects the endpoints observed on `pump.fun/live` as of the latest reconnaissance run (`npm run investigate`).

## Live Catalogue & REST APIs

| Purpose | URL | Notes |
|---------|-----|-------|
| Live stream roster | `https://frontend-api-v3.pump.fun/coins/currently-live` | Returns 60-entry pages with market data, viewer counts, thumbnails. Query params: `offset`, `limit`, `includeNsfw`. |
| Livestream metadata | `https://livestream-api.pump.fun/livestream?mintId=<mint>` | JSON payload with `numParticipants`, `streamStartTimestamp`, `mode`, etc. |
| Join LiveKit | `https://livestream-api.pump.fun/livestream/join` | `POST` body: `{ "mintId": "...", "viewer": true }`. Responds with `{ token, role }` (JWT for LiveKit). |
| Clip history | `https://livestream-api.pump.fun/clips/<mint>?limit=20&clipType=COMPLETE` | Returns recorded clips metadata when available. |
| Creator status | `https://livestream-api.pump.fun/livestream/is-approved-creator?mintId=<mint>` | Boolean flag used by the UI to gate features. |
| LiveKit regions | `https://pump-prod-*.livekit.cloud/settings/regions` | Requires `Authorization: Bearer <LiveKit token>`. Lists edge servers/regions for the active room. |

## WebSocket / WebRTC Endpoints

| Channel | URL | Protocol | Auth | Payload |
|---------|-----|----------|------|---------|
| Trades | `wss://frontend-api-v3.pump.fun/socket.io/?EIO=4&transport=websocket` | Socket.IO v4 | none | `tradeCreated` events with buy/sell data. |
| Live chat | `wss://livechat.pump.fun/socket.io/?EIO=4&transport=websocket` | Socket.IO v4 | none | chat + presence (`nx.UserPresence`) events for livestreams. |
| Livestream media | `wss://pump-prod-<cluster>.livekit.cloud/rtc?access_token=<JWT>&auto_subscribe=1&sdk=js&version=2.15.5&protocol=16` | LiveKit WebRTC (Protobuf over WebSocket) | LiveKit JWT from `/livestream/join` | Carries audio/video tracks for the room. |
| Internal bus | `wss://prod-v2.nats.realtime.pump.fun/` (and `unified-prod...`) | NATS | requires bearer token | Likely fan-out for internal services; connections without auth are dropped. |
| Solana RPC | `wss://pump-fe.helius-rpc.com/?api-key=<helius-key>` | JSON-RPC | API key embedded in frontend | Used for on-chain updates and program subscriptions. |
| Intercom analytics | `wss://nexus-websocket-a.intercom.io/...` | Custom | internal | Customer support SDK. |

## LiveKit Token Anatomy

LiveKit viewer tokens returned from `/livestream/join` are standard JWTs. Decoding the payload reveals:

```json
{
  "video": {
    "roomJoin": true,
    "roomCreate": false,
    "canPublish": false,
    "canSubscribe": true,
    "canPublishData": true,
    "room": "livestream:<mint>:<numeric_id>",
    "hidden": false
  },
  "metadata": "{\"anon\":true,\"role\":\"viewer\"}",
  "exp": 1758080134,
  "sub": "<random id>"
}
```

The token expires quickly (~15 minutes) and must be refreshed for long-running clients.

## Key Takeaways

- Livestream discovery is driven by REST endpoints — no need to reverse the UI grid. Use `npm run live -- list` to fetch the current roster.
- `livestream-api.pump.fun` is the authoritative surface for metadata, clips, approvals, and LiveKit credentials.
- Media playback uses LiveKit: to connect programmatically you must implement the LiveKit protocol (WebRTC). The scripts here stop at retrieving the token and region list; integration with `livekit-client` is a logical next step.
- `npm run subscribe -- <mint>` now demonstrates a full LiveKit subscriber session (metadata capture only, no media publishing).
- The legacy belief that "livestreams_enabled = false" is obsolete; remove references to it in older tooling.
- Additional WebSocket endpoints (NATS, Intercom) exist but require authentication or serve ancillary features.
