# Mode A data plane: display-list frames

Status: implemented on `next` during roadmap phase 1. This is the frame format that the phase 3 protocol will carry as its **data plane**. The manifest and the control channel are phase 3 work and are deliberately not designed here.

Mode A rule: the browser receives drawing primitives and draws them with the platform's own renderer (`public/render.js`). No game code reaches the browser.

## Pipeline

```
game tick (isolated runtime)
  -> frame emitted right after the tick            src/game-worker.js
  -> controller compacts the view once             src/traffic.js
  -> diff against the previous frame, once         src/server/frame-stream.js
  -> encoding per format, built lazily, shared     public/frame-codec.js
  -> per-socket backpressure (skip / disconnect)   src/traffic.js sendRoom
  -> browser decodes, reassembles the full list    public/frame-codec.js
  -> interpolates ids, draws on requestAnimationFrame   public/interpolate.js, public/client.js
```

## Decisions

1. **Send rate follows the game.** State goes out at the game's `meta.tickRate`, capped at 30 Hz. `VA_STATE_HZ` or `transport.stateHz` in `vibe-arena.config.json` override it, and the cap still applies. Sending is event-driven: each new game frame is forwarded as soon as the rate allows. A 10 Hz heartbeat keeps players, errors and fallback state flowing when the game produces no frames.
2. **No free-running clocks between tick and socket.** The isolated runtime emits its frame right after each tick. Before this, a separate 33 ms timer could forward a view that was up to one frame old. Ticks faster than about 40 Hz are thinned. A 100 ms heartbeat keeps slow-tick games inside the controller's 1 s frame watchdog.
3. **Draw on `requestAnimationFrame`, never per message.** At most one draw per display refresh, and none while the tab is hidden.
4. **Interpolation only by explicit `id`.** When a state arrives, primitives that carry the same `id` in the previous state move from what is on screen toward the new state over one measured send interval. Primitives without an `id` are drawn exactly as received, so games that never set ids render as before. Moves larger than 240 world units snap instead of sweeping. Rotation takes the short way round. Interpolation smooths motion between states that already arrived and never predicts. The first presented frame after a state already shows part of the move, and the measured input latency did not rise (see the table).
5. **Keyframes and deltas.** The first frame for a socket is a keyframe with the full list. After that, each frame is a delta against the previous one. For `layers` and for `hud`, a delta says how to rebuild the new list from the previous one:
   - copy a run of unchanged primitives;
   - patch one primitive (matched by `id`, otherwise by the same position when neither side has an id);
   - or add a new primitive.

   Static scenery therefore travels once, in the keyframe, and afterwards only as copy runs. The game does not need to declare static layers.
6. **When a keyframe is sent.** On join; after the socket skipped a frame under backpressure; when the client asks for `resync`; and whenever a delta would not be smaller than the keyframe. Deltas are computed once per frame and shared by every socket that holds the previous frame.
7. **Negotiated encodings with JSON fallback.** The client asks with `?frames=b1,d1`, and the first supported format wins:

   | Format | Content | Who gets it |
   |---|---|---|
   | `b1` | Keyframes and deltas in the binary layout below | Current browser client (default request) |
   | `d1` | The same keyframes and deltas as JSON | Clients that ask for JSON (`?frames=d1` on the page URL) |
   | `full` | Legacy complete `{t:'state'}` JSON every frame | Any client that does not ask, such as older clients and scripts |
   | `none` | No state frames, feed and control messages only | Sockets that never draw, such as the Studio conversation |

   The envelope fields (`players`, `activity`, `game`, `error`, `fallback`, `fund`) are JSON in every format. A delta carries only the envelope fields that changed. They change rarely, and JSON keeps them easy to evolve.
8. **Limits are unchanged.**
   - Compaction keeps at most 4096 primitives per list, bounded numbers rounded to 0.1 (rotation to 0.001), only the allowlisted sprite paths and capped strings.
   - Backpressure skips a socket's state frame above 128 KiB queued and disconnects the socket above 1 MiB.
   - Input frames are capped at 16 KiB and 120 messages per socket per second.
   - permessage-deflate stays at level 3 with no context takeover and a 1 KiB threshold.

## SDK contract change (optional field only)

Any primitive may carry `id`: a string of at most 64 characters, or an integer below 2^31 in magnitude. It names the same moving object in every frame. Ids should be unique within `layers` and within `hud`. Static scenery needs none. Nothing else in the SDK changed. `src/sdk-prompt.md` documents the field for generated games.

The bundled games (Grove, Marble Race, Democracy Duel) do **not** set ids yet. Their source is bound to reviewed hashes in `credits.json` and the publication registry. Adding ids is a reviewed change that the owner has to approve. The benchmark applies the same small patch to a disposable copy (`--ids`) to measure the effect.

## d1 (JSON)

```
keyframe {"t":"k","ts"?:ms,"s":seq, ...envelope, "view":{"bg","world":{"w","h"},"layers":[...],"hud":[...]}}
delta    {"t":"d","ts"?:ms,"s":seq, ...changed envelope, "v":{"bg"?,"world"?,"L":ops,"H":ops}}
ops      [0,from,len]          copy previous[from .. from+len)
         [1,from,{field:value|null}]   previous[from] with fields replaced (null deletes)
         [2,primitive]         new primitive
```

`ts` exists only with `VA_NET_PROBE=1`. `s` increases by one per frame. A delta whose `s` does not follow the client's last frame is rejected, and the client sends `{"t":"resync"}`.

## b1 (binary)

All integers are big-endian. *varint* is unsigned LEB128, *sint* is a zigzag varint, and *str* is a varint length followed by UTF-8 bytes.

```
u8   kind: 1 keyframe, 2 delta; bit 0x80 = ts present
u32  seq
f64  ts                         (only if bit 0x80)
str  envelope JSON ("" when no fields)
u8   view flags: 1 bg, 2 world
     [str bg] [sint w*10, sint h*10]
keyframe: varint n, n primitives (layers); varint n, n primitives (hud)
delta:    varint n, n ops (layers);        varint n, n ops (hud)
op:  u8 0 copy  varint from, varint len
     u8 1 patch varint from, fields with a deleted-mask
     u8 2 new   primitive
primitive: u8 type (rect, circle, line, text, sprite), fields
fields:    varint present-mask [varint deleted-mask, patches only], then values in field order
field order: x y x1 y1 x2 y2 w h r size rot color align text src fill id
           numbers: sint of value*10 (rot: value*1000), exact because the controller already rounded them
           strings: str; fill: u8; id: u8 tag (0 str, 1 sint) + value
```

## Measurements

See [the before/after table](#before-and-after) below and the raw runs in `docs/evidence/latency-*.json`. Reproduce with:

```
node scripts/latency/bench.mjs --label <name> --ids --out docs/evidence/latency-<name>.json
```

<!-- results inserted below -->
## Before and after

**Setup.**
- Same benchmark, seeds and scenarios for every step, run on one 12-core Linux host.
- Each run uses 8 headless viewers that run the real `public/client.js`, against the real controller and isolated game runtime.
- Runs last 60 s, except the Marble racing run. Only racing time counts there, which is about 2 s per run because races are short.
- Steps:
  - **baseline:** eb94d6b;
  - **a, tick rate:** 8711d20;
  - **b, rAF + interpolation:** af6d99b, with the harness fix cae50f3;
  - **c, keyframes/deltas, `b1`:** 6c6058d.
- The a-tick-rate report flags `dirty` only because the not-yet-imported files of steps b and c existed untracked.
- Games run with the `--ids` patch, applied to disposable copies. Baseline compaction drops `id`, so the baseline bytes equal those of the unmodified games.
- **Latency** runs from the input event to the first presented frame that shows its effect, on a 60 Hz vsync grid:
  - Grove: own avatar, web key;
  - Duel: streamer paddle, key;
  - Marble: own marble label, `!reset`/`!play` over chat.
- **KB/s** counts wire bytes per client, including WebSocket framing and permessage-deflate as negotiated, without TLS.


**Network: clean**

| Game | Step | Latency p50 / p99 (ms) | Distinct frames/s | Messages/s | KB/s per client | Controller CPU |
|---|---|---:|---:|---:|---:|---:|
| Grove | baseline | 87.1 / 156 (n=540) | 8.8 | 10 | 12.6 | 3.3% |
| Grove | a-tick-rate | 30.1 / 56.1 (n=648) | 23.6 | 30.3 | 37.7 | 6.1% |
| Grove | b-raf-interp | 26.2 / 47.3 (n=600) | 49.8 | 30.3 | 39.5 | 5.1% |
| Grove | c-delta-b1 | 27.6 / 57.7 (n=598) | 48.1 | 30.3 | 1.4 | 3.1% |
| Democracy Duel | baseline | 86.6 / 149.5 (n=64) | 10 | 10 | 11.4 | 3% |
| Democracy Duel | a-tick-rate | 25.1 / 54.7 (n=78) | 20.7 | 30.3 | 33.7 | 5.6% |
| Democracy Duel | b-raf-interp | 29 / 47.9 (n=72) | 35.4 | 30.3 | 34.2 | 4.8% |
| Democracy Duel | c-delta-b1 | 28.1 / 47.5 (n=72) | 35.1 | 30.3 | 1.8 | 2.7% |
| Marble Race (lobby, chat input) | baseline | 82.2 / 138.7 (n=109) | 1.8 | 10 | 14.3 | 3% |
| Marble Race (lobby, chat input) | a-tick-rate | 48.8 / 72 (n=117) | 1.9 | 30.3 | 43.0 | 6.7% |
| Marble Race (lobby, chat input) | b-raf-interp | 29.7 / 57.5 (n=119) | 2 | 30.3 | 43.3 | 5.5% |
| Marble Race (lobby, chat input) | c-delta-b1 | 28 / 49.3 (n=120) | 2 | 30.3 | 1.2 | 3% |
| Marble Race (racing) | baseline | — | 10 | 10 | 17.0 | 3.6% |
| Marble Race (racing) | a-tick-rate | — | 30.3 | 30.3 | 51.1 | 7.8% |
| Marble Race (racing) | b-raf-interp | — | 59.3 | 29.8 | 53.6 | 6.3% |
| Marble Race (racing) | c-delta-b1 | — | 59.5 | 30.3 | 5.2 | 3.4% |

**Network: 40±10 ms**

| Game | Step | Latency p50 / p99 (ms) | Distinct frames/s | Messages/s | KB/s per client | Controller CPU |
|---|---|---:|---:|---:|---:|---:|
| Grove | baseline | 174.2 / 227.4 (n=458) | 8.7 | 10 | 12.6 | 2.9% |
| Grove | a-tick-rate | 118.2 / 151.6 (n=521) | 25.2 | 30.2 | 37.9 | 7% |
| Grove | b-raf-interp | 106.7 / 135 (n=500) | 51.8 | 30.3 | 39.7 | 4.7% |
| Grove | c-delta-b1 | 107.1 / 137.7 (n=501) | 49.1 | 30.3 | 1.6 | 2.5% |
| Democracy Duel | baseline | 181 / 242.4 (n=58) | 10 | 10 | 11.4 | 2.8% |
| Democracy Duel | a-tick-rate | 109.4 / 139.7 (n=67) | 21.7 | 30.3 | 33.7 | 6% |
| Democracy Duel | b-raf-interp | 105.7 / 129.8 (n=62) | 36.8 | 30.3 | 34.2 | 4.6% |
| Democracy Duel | c-delta-b1 | 107.6 / 131.8 (n=63) | 36.6 | 30.3 | 1.8 | 2.3% |
| Marble Race (lobby, chat input) | baseline | 161.3 / 223.5 (n=94) | 1.6 | 10 | 14.3 | 3.1% |
| Marble Race (lobby, chat input) | a-tick-rate | 122.7 / 152.7 (n=100) | 1.7 | 30.3 | 43.1 | 6.6% |
| Marble Race (lobby, chat input) | b-raf-interp | 106.2 / 135.9 (n=101) | 1.7 | 30.3 | 43.2 | 4.9% |
| Marble Race (lobby, chat input) | c-delta-b1 | 111 / 137.9 (n=100) | 1.7 | 30.3 | 1.2 | 3% |
| Marble Race (racing) | baseline | — | 10 | 10 | 17.0 | 3.5% |
| Marble Race (racing) | a-tick-rate | — | 30.3 | 30.3 | 51.1 | 6.9% |
| Marble Race (racing) | b-raf-interp | — | 59.2 | 30.3 | 54.4 | 6.1% |
| Marble Race (racing) | c-delta-b1 | — | 59.6 | 30.4 | 4.8 | 3.3% |

**Network: 40±10 ms + 2% stalls**

| Game | Step | Latency p50 / p99 (ms) | Distinct frames/s | Messages/s | KB/s per client | Controller CPU |
|---|---|---:|---:|---:|---:|---:|
| Grove | baseline | 175.8 / 403.9 (n=452) | 8.5 | 10 | 12.6 | 2.8% |
| Grove | a-tick-rate | 112.1 / 330.2 (n=509) | 25.4 | 30.3 | 38.0 | 5.8% |
| Grove | b-raf-interp | 111 / 323.8 (n=479) | 45.5 | 30.3 | 39.7 | 4.8% |
| Grove | c-delta-b1 | 112.2 / 323.5 (n=481) | 44.4 | 30.3 | 1.6 | 2.7% |
| Democracy Duel | baseline | 174 / 376.4 (n=56) | 10 | 10 | 11.4 | 2.7% |
| Democracy Duel | a-tick-rate | 109 / 312.9 (n=62) | 22.2 | 30.3 | 33.6 | 5.5% |
| Democracy Duel | b-raf-interp | 119.7 / 324.3 (n=59) | 34.2 | 30.2 | 34.1 | 5.1% |
| Democracy Duel | c-delta-b1 | 112.9 / 310.5 (n=60) | 34.7 | 30.3 | 1.9 | 2.1% |
| Marble Race (lobby, chat input) | baseline | 158.5 / 305.4 (n=96) | 1.6 | 10 | 14.3 | 2.9% |
| Marble Race (lobby, chat input) | a-tick-rate | 115.6 / 309.9 (n=101) | 1.7 | 30.3 | 42.9 | 6.3% |
| Marble Race (lobby, chat input) | b-raf-interp | 121.6 / 325.6 (n=99) | 1.6 | 30.3 | 43.2 | 5.8% |
| Marble Race (lobby, chat input) | c-delta-b1 | 112.1 / 285.4 (n=100) | 1.7 | 30.3 | 1.2 | 2.9% |
| Marble Race (racing) | baseline | — | 9.9 | 9.9 | 16.9 | 3.1% |
| Marble Race (racing) | a-tick-rate | — | 30.3 | 30.3 | 50.3 | 6.8% |
| Marble Race (racing) | b-raf-interp | — | 50.4 | 29.6 | 52.9 | 7.7% |
| Marble Race (racing) | c-delta-b1 | — | 52.7 | 30.2 | 4.8 | 3.6% |

### Variants of step c (clean network)

Rows:
- `c-delta-b1`: binary deltas, the browser default.
- `c-delta-d1`: the same deltas as JSON, via `--frames d1`.
- `c-no-ids`: the **unmodified** bundled games, with no ids, via the browser default `b1`.


**Network: clean**

| Game | Step | Latency p50 / p99 (ms) | Distinct frames/s | Messages/s | KB/s per client | Controller CPU |
|---|---|---:|---:|---:|---:|---:|
| Grove | c-delta-b1 | 27.6 / 57.7 (n=598) | 48.1 | 30.3 | 1.4 | 3.1% |
| Grove | c-delta-d1 | 27 / 49.8 (n=600) | 49.8 | 30.3 | 4.1 | 2.6% |
| Grove | c-no-ids | 26.6 / 49 (n=638) | 22.8 | 30.3 | 1.5 | 2.6% |
| Democracy Duel | c-delta-b1 | 28.1 / 47.5 (n=72) | 35.1 | 30.3 | 1.8 | 2.7% |
| Democracy Duel | c-delta-d1 | 25.9 / 49.1 (n=72) | 33.5 | 30.3 | 3.9 | 2.4% |
| Democracy Duel | c-no-ids | 28.9 / 46.4 (n=76) | 20.5 | 30.3 | 1.8 | 2.3% |
| Marble Race (lobby, chat input) | c-delta-b1 | 28 / 49.3 (n=120) | 2 | 30.3 | 1.2 | 3% |
| Marble Race (lobby, chat input) | c-delta-d1 | 26.5 / 49.2 (n=120) | 2 | 30.3 | 2.9 | 2.6% |
| Marble Race (lobby, chat input) | c-no-ids | 26.2 / 49.4 (n=120) | 2 | 30.3 | 1.2 | 3.2% |
| Marble Race (racing) | c-delta-b1 | — | 59.5 | 30.3 | 5.2 | 3.4% |
| Marble Race (racing) | c-delta-d1 | — | 59.5 | 30.3 | 13.6 | 2.7% |
| Marble Race (racing) | c-no-ids | — | 30.3 | 30.3 | 5.2 | 3.3% |

### Reading the numbers

- **Latency.** Input to presented frame on a clean network fell from about 82–87 ms to 27–28 ms at p50, and from 139–156 ms to 47–58 ms at p99. With 40±10 ms each way (an 80 ms RTT floor), p50 fell from 161–181 ms to 107–111 ms. Almost all of this gain comes from step **a**: the input no longer waits for a 10 Hz timer.
- **Loss.** With 2% of segments stalled by a 200 ms RTO, p50 improves from about 158–176 ms to 112–113 ms. **p99 barely moves**: it goes from 305–404 ms to 285–324 ms. TCP head-of-line stalls dominate the tail, and no frame format fixes them. The next lever would be an unreliable transport, such as WebTransport datagrams, for the data plane. That is a phase 3 consideration.
- **Smoothness.** Distinct frames per second rose from 8.5–10 to 34–60 where ids move (b). Without ids, they stay at the message rate of about 20–30. In the Marble lobby nothing with an id moves, so the client draws exactly one frame per message and wastes no redraws.
- **Bandwidth.** Step a alone **tripled** traffic, from 11–17 KB/s to 34–51 KB/s per client. Step c brought it to 1.2–5.2 KB/s, which is **3–12× below the baseline** while sending 3× more messages. Binary `b1` is 2.2–2.9× smaller than JSON `d1`. The unmodified games, with no ids, get the same byte savings through positional patches, at the same latency.
- **Controller CPU** for 8 viewers was 2.7–3.6% in the baseline and rose to 5.5–7.8% with step a. With step c it is 2.1–3.6%: one diff per frame, and small messages below the deflate threshold.

### What did not improve, or is uncertain

- Step **b** does not reduce latency in Grove or Duel beyond noise. Its gain is smoothness. In the Marble lobby it reduced p50 from 49 to 30 ms. The likely reason is that step a still drew ~400 primitives synchronously on every message in the harness. How large that effect is in a real browser depends on the device and was not measured.
- **Run-to-run variance**, measured on 2026-11-03:
  - Two back-to-back repetitions of the clean scenario with `--ids` ran on the same commit (99a8222, the step c code plus docs) and the same seeds: `latency-c-var-1.json` and `latency-c-var-2.json`. The host was not idle: the 1-minute load average was 3.7–6.6 on 12 cores, from other work on the machine.

    | Game | p50 rep 1 / rep 2 / earlier `c-delta-b1` (ms) | p99 rep 1 / rep 2 / earlier (ms) | KB/s per client |
    |---|---:|---:|---:|
    | Grove | 25.3 / 26.8 / 27.6 | 48.1 / 48.2 / 57.7 | 1.4 / 1.4 / 1.4 |
    | Democracy Duel | 29.2 / 29.2 / 28.1 | 48.6 / 48.7 / 47.5 | 1.8 / 1.8 / 1.8 |
    | Marble Race (lobby) | 28 / 27.1 / 28 | 52.8 / 49.3 / 49.3 | 1.2 / 1.2 / 1.2 |
    | Marble Race (racing) | — | — | 4.6 / 4.6 / 5.2 |

  - Back to back, p50 differed by at most 1.5 ms and p99 by at most 3.5 ms. Bytes, messages and distinct frames per second matched within 3%. Controller CPU differed by up to 0.5 points.
  - The earlier `c-delta-b1` run of the same code differed more: Grove p99 was 57.7 ms against 48.1–48.2 ms now. The p99 rise from 47 to 58 ms that step **c** appeared to cause is therefore noise, not a regression.
  - Rule from these runs: **treat p50 differences under about 3 ms and p99 differences under about 10 ms as noise.** Marble racing bytes vary by about 12%, because each run has only about 2 s of racing.
  - Duel under loss moved from 109 (a) to 120 (b) to 113 (c) ms at p50 with n≈60. That lossy scenario was not repeated, so its variance is not known.
- Marble racing traffic comes from about 2 s of racing per run, so it is less stable than the other rows.
- **Limits of the method.**
  - Loss is modelled as RTO stalls, not as real packet loss.
  - There is no TLS.
  - The recording canvas is not a GPU canvas.
  - The display is assumed to refresh at 60 Hz.
  - No real browser on a real network is measured. The Chromium UI rehearsal (36/36 checks) confirms only that the shipped client works with these frames.

