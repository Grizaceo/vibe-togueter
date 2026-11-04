# PR 001: chore: document scripts and ignore disposable rehearsal output

Local branch: `chore/repo-hygiene` → `develop`. No remote, push or publication.

## What and why

Document all nine npm scripts and ignore new disposable browser outputs and generated formatting targets. Keep historical evidence in place. Audit found 262 local Markdown file links and zero missing targets; no evidence links were relocated. No orphan was deleted without evidence of safe removal.

## Risk

Low: documentation and ignore patterns only. Existing tracked evidence remains versioned.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-refactor-baseline-test.log`, `/tmp/vibe-refactor-baseline-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr001-test.log`, `/tmp/vibe-pr001-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `.gitignore` | 9 | 12 |
| `.prettierignore` | 0 | 5 |
| `README.md` | 130 | 132 |
| `docs/NPM_SCRIPTS.md` | 0 | 19 |
