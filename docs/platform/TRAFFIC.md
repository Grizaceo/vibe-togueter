# Controller traffic and idle work

> **Update (phase 1, `next`):** state now follows the game's tick rate (capped at 30 Hz) and negotiated clients receive keyframes plus binary or JSON deltas instead of full frames. See [MODE_A_FRAMES.md](MODE_A_FRAMES.md) for the current data plane and the measured before/after table. The 10 Hz figures below describe the earlier controller.

The controller emitted state every 100 ms (previously 66 ms), projects flat SDK primitives and rounds view coordinates to 0.1 world units (rotation keeps 0.001 radians) and negotiates permessage-deflate at level 3 without context takeover. Monetary accounting fields retain their precision. Clients that decline compression still benefit from the lower cadence and compact coordinates. A socket with more than 128 KiB queued skips obsolete state; above 1 MiB it disconnects. WebSocket input frames are capped at 16 KiB and 120 messages per socket-second. This is an application guard, not a replacement for a hosting-level connection limit or DDoS protection.

Chat admission precedes feed, commands, round writes and Tee forwarding: one accepted message per actor per 250 ms, at most 30 per instance-second, with at most 20,000 actor entries and stale-entry eviction. Ordinary text is capped at 200 characters. Explicit !idea submissions retain their separately bounded 10,000-character/round-word allowance, so the studio's word settings still work. Authenticated Twitch emergency fallback is handled before this gate; crowd spam cannot consume its admission slot. IRC dedupe and the Tee bridge's pulse/idle limits remain in force. Web display names do not grant moderator status.

The studio now fetches state every five seconds while visible, fifteen while hidden, and catalogs at most every thirty seconds during ordinary polling. A refresh-in-flight guard prevents overlap. Explicit owner actions can refresh catalogs immediately. Countdown rendering remains local at one second. A no-op round tick returns before cloning the persistent history; mutations still use atomic durable writes. Do not trade durable approval correctness for a speculative batching optimization. Archiving large closed-round histories remains future maintenance.

Reproduce the local before/after state estimate:

```
node --experimental-vm-modules scripts/measure-state.mjs /tmp/state-bandwidth.json
```

Saved result: docs/evidence/state-bandwidth.json. Twenty web players and twenty chat actors; 100 sampled active frames for each game. Identical frames are serialized through the previous envelope and the compact path, then deflated independently. No Twitch or cloud services are called.

| Game | Previous estimate GB/client-hour | Compact, no compression | Compact + negotiated deflate | Reduction with deflate |
|---|---:|---:|---:|---:|
| Marble Race | 1.190 | 0.696 | 0.083 | 93.0% |
| Democracy Duel | 0.185 | 0.122 | 0.038 | 79.4% |
| Community Grove | 0.306 | 0.201 | 0.036 | 88.3% |

This is a payload estimate, excluding TLS/framing/handshake/feed/credit traffic, not measured billed egress. The initial Marble frame independently reproduced the audit's order of magnitude at 19,287 bytes (1.052 GB/client-hour at 66 ms). Active race frames are larger, so use the paired active-frame comparison above. test/traffic-integration.mjs verifies actual compression negotiation and admission before feed broadcast against a disposable controller; pure tests cover coordinate precision and slow-client backpressure. Human assessment of the lower display cadence remains part of rehearsal.

The first suite after throttling exposed a legacy E2E test sending three user actions with no gap. That test now spaces ordinary actions by 300 ms; a separate flood test explicitly verifies that a burst is rejected. The failed log remains /tmp/vibe-traffic-first.log. Full passing output is docs/evidence/traffic-tests.txt.
