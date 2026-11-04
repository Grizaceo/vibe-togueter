# PR 008: refactor(worker): separate provider build test and cleanup

Local branch: `refactor/worker-responsibilities` → `develop`. No remote, push or publication.

## What and why

Keep the public CreateOSStudioWorker adapter, lease validation and durable journal operations in place. Extract provider CLI/managed polling, artifact construction, separate-VM testing and supervised cleanup into src/studio-worker/. Retain overridable adapter methods through direct delegates.

## Risk

High-consequence boundary, validated with mocks only: all 9 extracted method bodies and parameters match the frozen AST after the sole this-to-worker reference substitution; retained journal/save/readiness/ownership bodies match exactly. The full suite and browser rehearsal passed. No real provider command or model call was made.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr007-test.log`, `/tmp/vibe-pr007-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr008-test.log`, `/tmp/vibe-pr008-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/createos-studio-worker.js` | 718 | 229 |
| `src/studio-worker/build.js` | 0 | 135 |
| `src/studio-worker/cleanup.js` | 0 | 122 |
| `src/studio-worker/provider.js` | 0 | 108 |
| `src/studio-worker/test.js` | 0 | 198 |
