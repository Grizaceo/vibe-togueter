# Cloudflare waiting-game VM trial — 2026-11-02

Vibe Togueter is the platform; code remains Vibe Arena. teeworlds-rs is Cristóbal Muñoz’s external game, developed separately with Devin and Hermes. This trial connects that game; it does not attribute its development to Codex.

## Verified

One authorized CreateOS guest served the game through a Cloudflare Quick Tunnel running inside the guest. The PC hosted only the private Twitch receiver. A real manual `!join` in gris_96 produced the full HTTPS entry link. At 19:58 UTC the owner confirmed: “si puedo entrar y jugar sin problema”. The earlier timed-out attempt is retained and is not counted as success.

Public trial entry was `https://built-berlin-allowed-supplied.trycloudflare.com/tee-play.html?game=tee-vm&name=gris_96`. This address is historical evidence, not a persistent service. A display name carries no authenticated role or privilege.

The browser rehearsal passed 11 checks: credited platform entry, HTTPS game access, two automated WSS clients with authoritative snapshots/acks, keyboard movement, disconnect roster removal, ONLINE return, matching served WASM hash and no browser/schema errors. Automated clients are not human participants. Credits were visually inspected and readable in the saved capture.

## Exact source and contract

- Game base: `172cfef66565af00f75e865c60e3c91859beb039`.
- Isolated hardened game: `0c6250d86c59d7ec166ded0785baef51529fb9ec`.
- Packaged platform revision: `1a1cf080bd644c0925228ab4b25adb4a0af751cc`; subsequent trial launcher fixes are recorded in this branch and the evidence receipt.
- Native contract version 1, schema `teeworlds-rs/172cfef`. Full postcard consumption; unknown schema/version/fields and trailing bytes rejected. This is not official Teeworlds/DDNet interoperability.
- Server SHA256: `240c99946f82cde337c1e573a89f5c69373b15a8a9cbe13f9c42764667da1e25`.
- WASM SHA256: `37ab48f1c61fcade5a87be77c0112a5a19583413765882921e5751c7343e88d4`.
- Built at `2026-11-02T19:37:34.418Z`, one authorized Rust/WASM build.

## Isolation and setup limits

Guest `sb-01m6ew2nn4nb53z4d0cy3h497t`, name `va-build-922a1ceb22cc`, devbox:1 / s-1vcpu-2gb, created 19:34:15 UTC. Approval: one guest, up to 30 minutes and US$0.25 of existing credit, no models or top-ups. Absolute expiry 20:04:06.057 UTC. This is an operational spending bound; no exact provider billing total is claimed.

Game runs as vtgame with loopback backend, BOTS=0 and existing deathmatch mechanics. Narrow gateway exposes game assets, entry, version manifest and WSS; admin/API paths return 403. Text backend health is explicitly translated to registry JSON only after upstream verification. No host, Twitch or OpenAI credentials were copied into the guest. Model/worker/prewarm remain disabled.

Setup encountered a guest Node permission issue and an initial Cloudflare 530. We copied the existing Node executable to the unprivileged app path and corrected Cloudflare egress to two API domains plus twenty explicit edge IPv4:7844 entries. Only this trial runtime was restarted; no additional game build or VM was created. Broad build registry egress was removed after construction. The failed initial endpoint is not counted as access proof.

## Pending

Two humans playing/interacting in the same match, a human on another network, authenticated streamer roles, automatic preparation of both VMs, new-game readiness announcement and streamer-approved cross-game handoff remain unverified or unimplemented. This is individual keyboard/mouse play; it is neither a collective chat tee nor spectator buffs.

A stable platform URL/custom domain and definitive hosting remain pending. Quick Tunnels are temporary trial transport, not platform hosting. Frozen submission branch/tag and protected artifacts remain unchanged. No integration has been merged into develop or the frozen delivery.

Evidence: `docs/evidence/tee-cloudflare-browser-1793648603861.json`, its two captures, `tee-remote-join-1793649525635.json`, and the separate trial/cleanup receipt in this directory’s evidence sibling. The earlier zero-command receipt is retained.

## Cleanup confirmed

The owned guest was destroyed at **19:58:48.351854 UTC**, before the absolute deadline. A separate provider get confirmed terminal `destroyed`; only then was the independent cleanup timer stopped. The Twitch receiver was disconnected and its final one-command receipt saved. No resource was renewed or replaced. The temporary link is now retired.

## Checks and incorporation scope

Platform npm test passed 282 checks (172 focused + 110 integration); the platform Chromium rehearsal passed 36 checks. The separate real-VM browser rehearsal passed 11. The isolated game Rust check and strict postcard unit test passed. Final launcher JavaScript and shell syntax checks passed. No training or footage builds were run.

To incorporate the demonstrated path, review the feature chain ending at `feat/session-flow-cloudflare-20261102`: versioned native codec and individual entry, narrow VM gateway and packaging, bounded Cloudflare trial launcher/cleanup, remote Twitch receiver, browser rehearsal and this evidence. The external game requires the separate `0c6250d` network-hardening patch and a matching build; its source remains external. Supply approved runtime allocation and private receiver configuration at operation time. No permanent endpoint or autonomous lifecycle is supplied by these changes.

The private OpenAI wrapper is a separate optional feature in `feat/private-openai-auth-wrapper-20261102`, based on develop; it is not necessary for the waiting-game proof and its real authorization/dispatch acceptance is pending. Review its changes independently for overlapping Studio files. Neither feature branch has been merged. Adding any part to frozen delivery would require an explicitly approved selection/review against `113c3f5`; the frozen branch and tag have not moved.
