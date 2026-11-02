# PR 007: refactor(studio): split panels into ES modules and extract CSS

Local branch: `refactor/studio-panels` → `develop`. No remote, push or publication.

## What and why

Split rounds/conversation, resources, contributions, owner controls, remote games, fallback/delegation and worker/prewarm into public/studio/ modules. Keep shared state as live ES bindings with explicit setters. Keep initial refresh and event/timer registration order. Extract the inline style content literally to public/studio.css.

## Risk

Browser module loading, owner unlock/lock, exact artifact review and mocked prewarm actions passed all 36 checks. CSS content is byte-identical to the original style body; 1280×720 Studio comparison only differed in the dynamic countdown text region. A syntax cut in the control-panel extraction was corrected within ten minutes before the final full checks. No test file changed.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr006c-test.log`, `/tmp/vibe-pr006c-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr007-test.log`, `/tmp/vibe-pr007-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `public/studio.css` | 0 | 244 |
| `public/studio.html` | 673 | 428 |
| `public/studio.js` | 918 | 63 |
| `public/studio/contributions.js` | 0 | 185 |
| `public/studio/controls.js` | 0 | 58 |
| `public/studio/owner.js` | 0 | 115 |
| `public/studio/remote-games.js` | 0 | 152 |
| `public/studio/resources.js` | 0 | 63 |
| `public/studio/rounds.js` | 0 | 118 |
| `public/studio/shared.js` | 0 | 61 |
| `public/studio/worker.js` | 0 | 232 |
