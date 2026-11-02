# Lantern Table roles revision — exact owner approval confirmed

This revision implements the conditional small-chat roles from block C. The earlier approved Lantern Table remains unchanged. Current Codex authored this revision as inert text; it did not come from another model call inside a coding VM. Only the separate test guest executed it. No new OpenAI login was needed.

## Inspect

- [Exact inert source](../../artifacts/lantern-table-roles-draft/game.js)
- [Fourteen-check real test-VM report](../../artifacts/lantern-table-roles-draft/report.json)
- [Role revision provenance and credit](../../artifacts/lantern-table-roles-draft/review.json)
- [Actual test/cleanup receipt](../evidence/lantern-roles-test-receipt.json)
- [Static test frame](../evidence/lantern-roles-static-preview.png) — synthetic Alice/Bob/Cara, not real audience participation

Source SHA-256: `449a8def63ca7d6d0261ef0e60d8bea9dddd743962bf6a16e8367674e1b5e075`

Artifact binding: `2ace765e1afe180f79c9bbee2d79382c8d5ac56b769d2f49de16ceffffd1255e`

Report binding: `4887b956295ead670534337770a059f020f749ba5a81086c69b5802c14967797`

Test guest `sb-01m6dgs6pxn932qp4gtw0rrtg6` is independently verified destroyed. All 14 checks passed. They cover three role seats, per-role command/cooldown gates, rotation after a round, one-person bot fill, opt-out, inactivity, chatter-resistant bot clocks, bounded state/frame, player cap/reset and defeated-enemy damage. Some edge setups deliberately set state inside the guest; this does not establish a natural five-round playthrough, human/Twitch gameplay or production balance.

`!role` joins; `!role off` leaves. Three people rotate through die/monster/healer; larger queues enter in three-round groups. Bots fill missing seats and seats inactive for 60 simulated seconds. `!roll` displays a random die result only. Browser heroes and role members are capped at 32. The earlier two static gameplay issues are addressed and their focused guest fixtures pass in this version.

Proposed game credit: **Cristóbal Muñoz · Codex-assisted**. No external image/audio assets are selected; artwork is code-drawn. Input credit records the actual owner-approved revision and zero ballots. The owner confirmed exact-version/rights approval for [local reviewed evidence](../evidence/lantern-roles-reviewed-publication.json). This does not deploy a runtime, publish externally or execute the candidate on this PC. No further VM or model action is included in that approval.
