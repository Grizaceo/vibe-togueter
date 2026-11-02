# Structural refactor report — November 2, 2026

The frozen submission is preserved. The structural refactor was first integrated locally on branches descended from the annotated tag, then promoted through 14 real GitHub PRs into `develop` after the owner authorized repository creation, push and merge. The private repository is [Vibe Togueter](https://github.com/Grizaceo/vibe-togueter); application/package names and the local directory remain unchanged. No dependency was installed, hosting deployed, cloud VM operated or model invoked. Tests use temporary copies and mocked providers; Chromium rehearsal is local and disposable.

## Protected submission

- Frozen commit and unchanged `feat/twitchcon-codex`: `113c3f500fcec4c82808d176bd613607c27a9978`.
- Annotated `submission-2026-11-02` object: `1caae2e27206c87fe756d4a6462c74499a5a1dce`; peeled target: the same frozen commit. Message: `Frozen hackathon submission`.
- Evaluation protection runs through November 15. No integration into the submission branch is authorized by this refactor.
- All tracked artifacts remain unchanged. The 13 protected Lantern Table / Seed Race files match the frozen bytes and SHA-256 values in the [integrity receipt](../prs/integrity.json).
- `test/`, `package.json`, lockfile, configuration and SDK prompt are byte-identical to the frozen tree. Existing owner runtime journals were not used by verification or reset.

## PR status and checks

Each merged row was freshly verified again for its real GitHub PR and has **271/271 npm checks (161 focused + 110 isolated integration)** and **36/36 Chromium checks** both before and after. Consecutive PRs reuse the previous post-checks as their pre-checks on the same code tree; docs/ignore changes do not change executed code. Each linked summary records touched-file line counts, purpose, risk and session log paths. [Compact receipts](../prs/verification.json) preserve exact counts and browser outcomes independently of temporary logs.

| PR | Topic | Status | Before → after |
| --- | --- | --- | --- |
| [001](../prs/001-repo-hygiene.md) | Repository hygiene | [Merged GitHub #1](https://github.com/Grizaceo/vibe-togueter/pull/1) | 271 + 36 → 271 + 36 |
| [002](../prs/002-server-bootstrap.md) | Configuration/bootstrap | [Merged GitHub #2](https://github.com/Grizaceo/vibe-togueter/pull/2) | 271 + 36 → 271 + 36 |
| [003](../prs/003-server-public.md) | Public routes | [Merged GitHub #3](https://github.com/Grizaceo/vibe-togueter/pull/3) | 271 + 36 → 271 + 36 |
| [004](../prs/004-server-admin.md) | Admin routes and existing gates | [Merged GitHub #4](https://github.com/Grizaceo/vibe-togueter/pull/4) | 271 + 36 → 271 + 36 |
| [005](../prs/005-server-chat.md) | Chat commands | [Merged GitHub #5](https://github.com/Grizaceo/vibe-togueter/pull/5) | 271 + 36 → 271 + 36 |
| [006](../prs/006-server-broadcast.md) | WS room/activity | [Merged GitHub #6](https://github.com/Grizaceo/vibe-togueter/pull/6) | 271 + 36 → 271 + 36 |
| [006a](../prs/006a-server-webhooks.md) | Provider webhooks | [Merged GitHub #7](https://github.com/Grizaceo/vibe-togueter/pull/7) | 271 + 36 → 271 + 36 |
| [006b](../prs/006b-server-game-lifecycle.md) | Game lifecycle/publication | [Merged GitHub #8](https://github.com/Grizaceo/vibe-togueter/pull/8) | 271 + 36 → 271 + 36 |
| [006c](../prs/006c-server-construction.md) | Construction coordination | [Merged GitHub #9](https://github.com/Grizaceo/vibe-togueter/pull/9) | 271 + 36 → 271 + 36 |
| [007](../prs/007-studio-panels.md) | Studio panels and literal CSS | [Merged GitHub #10](https://github.com/Grizaceo/vibe-togueter/pull/10) | 271 + 36 → 271 + 36 |
| [008](../prs/008-worker-responsibilities.md) | Worker provider/build/test/cleanup | [Merged GitHub #11](https://github.com/Grizaceo/vibe-togueter/pull/11) | 271 + 36 → 271 + 36 |
| [009](../prs/009-rehearsal-scenes.md) | CDP and screen scenes | [Merged GitHub #12](https://github.com/Grizaceo/vibe-togueter/pull/12) | 271 + 36 → 271 + 36 |
| [009a](../prs/009a-server-platform-chat.md) | Platform connections/readable wiring | [Merged GitHub #13](https://github.com/Grizaceo/vibe-togueter/pull/13) | 271 + 36 → 271 + 36 |
| [010](../prs/010-refactor-map.md) | Architecture/index/report | [Merged GitHub #14](https://github.com/Grizaceo/vibe-togueter/pull/14) | 271 + 36 → 271 + 36 |
| [011](../prs/011-language.md) | Language | Functional edits discarded; audit recorded | No code change; same green tree |

Additional server PRs kept webhooks, game lifecycle/publication, construction coordination and platform connections independently reviewable. PR 009a also normalizes extraction indentation/wrapping; the nine otherwise touched module ASTs are identical before/after, and `git diff -w` isolates its small connection extraction. Nothing was squashed, rebased, amended or rewritten. GitHub generated its own merge commits; the existing local and GitHub histories were joined with an ordinary merge of identical trees. The [GitHub PR index](../prs/README.md) and [integration receipt](../prs/github-integration.json) record all real PRs, verified trees and merge commits. There are no open/unmerged implementation PRs at completion.

## File sizes (`wc -l`)

| Original entry | Frozen lines | Develop lines |
| --- | ---: | ---: |
| `src/server.js` | 1894 | 291 |
| `public/studio.js` | 918 | 63 |
| `scripts/rehearse-ui-local.mjs` | 750 | 250 |
| `src/createos-studio-worker.js` | 718 | 229 |
| `public/studio.html` | 673 | 428 |
| `src/idea-rounds.js` | 592 | 592 |
| `src/studio-builds.js` | 584 | 584 |
| `src/build-quarantine.js` | 479 | 479 |

The entry points shrink by moving responsibilities, not deleting functionality. Total lines can grow with explicit imports, module boundaries and adapter delegates.

| Extracted area | Files and final line counts |
| --- | --- |
| Server support | `src/server/bootstrap.js` 69; `src/server/broadcast.js` 235; `src/server/chat-commands.js` 254; `src/server/config.js` 56; `src/server/construction.js` 169; `src/server/game-lifecycle.js` 138; `src/server/platform-chat.js` 56; `src/server/publication.js` 51; `src/server/routes/admin.js` 638; `src/server/routes/public.js` 140; `src/server/routes/webhooks.js` 285 |
| Studio panels | `public/studio/contributions.js` 185; `public/studio/controls.js` 58; `public/studio/owner.js` 115; `public/studio/remote-games.js` 152; `public/studio/resources.js` 63; `public/studio/rounds.js` 118; `public/studio/shared.js` 61; `public/studio/worker.js` 232; `public/studio.css` 244 |
| Worker | `src/studio-worker/build.js` 135; `src/studio-worker/cleanup.js` 122; `src/studio-worker/provider.js` 108; `src/studio-worker/test.js` 198 |
| Browser rehearsal | `scripts/rehearsal/cdp.mjs` 79; `scripts/rehearsal/lobby.mjs` 63; `scripts/rehearsal/overlay.mjs` 255; `scripts/rehearsal/privacy.mjs` 10; `scripts/rehearsal/studio.mjs` 184 |

## Compatibility evidence

- Every required run passes the existing full suite and rehearsal without assertion edits. No file in `test/` changed, including imports.
- All nine extracted worker method bodies/parameters match the frozen syntax tree after only `this` → `worker`; retained constructor, lease, journal persistence, readiness and ownership bodies match exactly. Journals, process identities, cleanup timers and reconciliation remain unchanged.
- All 31 browser `check(...)` call syntax trees, including their complete assertions and order, match the frozen rehearsal. Loops still execute 36 checks. Scene setup and mock HTTP remain unchanged.
- The CSS file is byte-identical to the original `<style>` body. A Studio screenshot comparison at 1280×720 found differences confined to a six-pixel-high band at the upper resource-card corners; visual inspection showed matching layout. Rehearsal also exercises 1080p/720p overlay layouts and owner controls.
- HTTP/WS routes, auth ordering, body limits, source containment, compression/backpressure, 100 ms cadence, feature defaults and public/private snapshot boundaries are preserved. Existing protocol tests pass; no broader formal equivalence claim is made.
- Two extraction mistakes were corrected within ten minutes: a Studio control initializer cut caught by syntax checking, and an omitted `sleep` dependency caught by the browser rehearsal. No failed version was merged. No assertions were weakened.
- Markdown file targets and local heading anchors were audited, as were all 27 unique external destinations with HTTP HEAD. See the [link audit](../prs/markdown-link-audit.json). No evidence was moved, and no historical link was repointed. External reachability is a point-in-time result, not a content/currency endorsement.

## Retained debt

- `idea-rounds.js` (592), `studio-builds.js` (584) and `build-quarantine.js` (479) retain their durable state-machine responsibilities. Further subdivision needs its own small, verified topic; this session does not redesign their transactions or journal formats.
- Admin routes remain one 638-line responsibility so the existing authorization boundary stays together. There is no new router framework or privilege model.
- Studio shares state and refresh through live ES module bindings, including cyclic function references. Splitting state into stores, controllers or an event bus would be a redesign and was not introduced.
- PR 011: SDK prompt already English; remaining Kick/MCP output translations would change observable bytes/model input. They are explicitly deferred under the behavior-preservation stop rule. UI proper names and compatible aliases are not translation defects.
- Historical evidence stays where linked. No unproven orphan deletion or bulk archival was performed. The platform index distinguishes current contracts, historical receipts and future requirements; older counts/deadlines remain historical.
- Generated-game runtime VMs, hosting, payment settlement, human gameplay/Twitch/OBS evidence and further provider/model spending remain outside this structural session.

## Owner decisions

The owner authorized the private [vibe-togueter](https://github.com/Grizaceo/vibe-togueter) remote, push and real PR merges toward develop; those actions are complete. The owner still decides when to integrate develop into the submitted branch, respecting evaluation protection through November 15. The submission branch/tag have not changed.
