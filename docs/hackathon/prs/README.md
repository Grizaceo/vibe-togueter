# Refactor pull requests

Repository: [Vibe Togueter](https://github.com/Grizaceo/vibe-togueter) (private). The platform name does not rename the Vibe Arena application, npm package or local directory. The owner authorized repository creation, push and real PR merges in this session. `develop` is the default/integration branch.

Summaries 001–010 describe the original local review session. Their statements that no remote or push existed are historical. The table below records the subsequent real GitHub PRs. Each was merged in order toward `develop` after fresh **271/271 npm checks (161 focused + 110 integration)** and **36/36 Chromium checks** in a disposable checkout. After merging, the full Git tree matched the verified original local merge tree. Existing local history was retained without rebasing or rewriting.

| Local summary | GitHub PR | Status |
| --- | --- | --- |
| [001](001-repo-hygiene.md) | [#1: chore: document scripts and ignore disposable rehearsal output](https://github.com/Grizaceo/vibe-togueter/pull/1) | Merged into develop |
| [002](002-server-bootstrap.md) | [#2: refactor(server): extract config and bootstrap](https://github.com/Grizaceo/vibe-togueter/pull/2) | Merged into develop |
| [003](003-server-public.md) | [#3: refactor(server): extract public routes and static delivery](https://github.com/Grizaceo/vibe-togueter/pull/3) | Merged into develop |
| [004](004-server-admin.md) | [#4: refactor(server): extract private admin routes](https://github.com/Grizaceo/vibe-togueter/pull/4) | Merged into develop |
| [005](005-server-chat.md) | [#5: refactor(server): extract chat command pipeline](https://github.com/Grizaceo/vibe-togueter/pull/5) | Merged into develop |
| [006](006-server-broadcast.md) | [#6: refactor(server): extract WebSocket room and activity broadcast](https://github.com/Grizaceo/vibe-togueter/pull/6) | Merged into develop |
| [006a](006a-server-webhooks.md) | [#7: refactor(server): extract provider webhook routes](https://github.com/Grizaceo/vibe-togueter/pull/7) | Merged into develop |
| [006b](006b-server-game-lifecycle.md) | [#8: refactor(server): extract game lifecycle and publication refresh](https://github.com/Grizaceo/vibe-togueter/pull/8) | Merged into develop |
| [006c](006c-server-construction.md) | [#9: refactor(server): extract construction coordination](https://github.com/Grizaceo/vibe-togueter/pull/9) | Merged into develop |
| [007](007-studio-panels.md) | [#10: refactor(studio): split panels into ES modules and extract CSS](https://github.com/Grizaceo/vibe-togueter/pull/10) | Merged into develop |
| [008](008-worker-responsibilities.md) | [#11: refactor(worker): separate provider build test and cleanup](https://github.com/Grizaceo/vibe-togueter/pull/11) | Merged into develop |
| [009](009-rehearsal-scenes.md) | [#12: refactor(rehearsal): extract CDP helpers and screen scenes](https://github.com/Grizaceo/vibe-togueter/pull/12) | Merged into develop |
| [009a](009a-server-platform-chat.md) | [#13: refactor(server): finish platform chat wiring and normalize module layout](https://github.com/Grizaceo/vibe-togueter/pull/13) | Merged into develop |
| [010](010-refactor-map.md) | [#14: docs: map modules trust boundaries and refactor evidence](https://github.com/Grizaceo/vibe-togueter/pull/14) | Merged into develop |
| [011](011-language.md) | No GitHub PR: discarded functional language edits | SDK prompt already English; Kick/MCP translations remain debt |

The [integration receipt](github-integration.json) records exact branch/merge commits and verified trees. [Original frozen integrity](integrity.json) and [local verification](verification.json) remain historical receipts. The [current refactor report](../platform/REFACTOR_REPORT.md) records remaining debt.

The frozen `feat/twitchcon-codex` branch and annotated `submission-2026-11-02` tag still point to `113c3f500fcec4c82808d176bd613607c27a9978`. Approved artifacts, test assertions, configuration and dependency files are unchanged. No hosting deployment, new VM or model operation occurred.
