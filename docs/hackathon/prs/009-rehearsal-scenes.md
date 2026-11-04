# PR 009: refactor(rehearsal): extract CDP helpers and screen scenes

Local branch: `refactor/rehearsal-scenes` → `develop`. No remote, push or publication.

## What and why

Move CDP commands/evaluation/input/navigation/capture into scripts/rehearsal/cdp.mjs and move lobby, overlay, Studio and privacy scenes into separate modules. Preserve scene order, disposable environment, screenshot names and resource cleanup. Keep socket/latest as shared live bindings between lobby and overlay.

## Risk

The 31 check call ASTs, including full assertion expressions and order, are identical to the frozen script; loops still execute 36 checks. A missing sleep dependency in the overlay scene caused one failed rehearsal and was fixed within ten minutes; both required final checks passed. No test assertion changed.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr008-test.log`, `/tmp/vibe-pr008-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr009-test.log`, `/tmp/vibe-pr009-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `scripts/rehearsal/cdp.mjs` | 0 | 79 |
| `scripts/rehearsal/lobby.mjs` | 0 | 63 |
| `scripts/rehearsal/overlay.mjs` | 0 | 255 |
| `scripts/rehearsal/privacy.mjs` | 0 | 10 |
| `scripts/rehearsal/studio.mjs` | 0 | 184 |
| `scripts/rehearse-ui-local.mjs` | 750 | 250 |
