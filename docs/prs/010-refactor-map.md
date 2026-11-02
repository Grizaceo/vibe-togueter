# PR 010: docs: map modules trust boundaries and refactor evidence

Local branch: `docs/refactor-map` → `develop`. No remote, push or publication.

## What and why

Update the architecture map and add a platform index distinguishing current operations, historical receipts and future requirements. Publish the refactor report, per-run counts, link audit and frozen-artifact SHA-256 receipt. Record PR 011 as discarded functional translations: sdk-prompt.md already satisfies English O13, while changing Kick/MCP output would violate the behavior-preservation rule. Correct the earlier screenshot note after visual inspection: its small pixel differences were at resource-card corners, not countdown text.

## Risk

Documentation only. All 395 Markdown link occurrences across 61 files resolve locally or to reachable external targets (27 unique external HEAD checks); no evidence moved. No source/test/configuration/artifact changes in this PR. Frozen branch and annotated tag still target 113c3f5. Full suite and local browser rehearsal passed again.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr009a-test.log`, `/tmp/vibe-pr009a-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr010-test.log`, `/tmp/vibe-pr010-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `docs/ARCHITECTURE.md` | 30 | 47 |
| `docs/platform/README.md` | 0 | 51 |
| `docs/platform/REFACTOR_REPORT.md` | 0 | 80 |
| `docs/prs/007-studio-panels.md` | 32 | 32 |
| `docs/prs/011-language.md` | 0 | 11 |
| `docs/prs/integrity.json` | 0 | 26 |
| `docs/prs/markdown-link-audit.json` | 0 | 144 |
| `docs/prs/verification.json` | 0 | 2387 |
