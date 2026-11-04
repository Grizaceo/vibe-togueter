# PR 011: language audit — discarded functional changes

Status: discarded, no implementation branch or merge. Audit recorded in documentation PR 010.

`sdk-prompt.md` is already entirely English at the frozen commit, including the explicit English-visible-text rule. O13 needs no change. Its bytes remain identical.

The current public UI has no Spanish prose found in the source audit; the operator’s proper name “Cristóbal Muñoz” is preserved. Backward-compatible chat aliases `unirse`, `entrar`, `jugar-link` remain valid commands. Spanish comments are not user-visible.

Visible Spanish remains in the optional Kick startup log in `src/server/platform-chat.js` and in MCP descriptions, schema help, error replies and the startup log in `src/mcp-server.js` (for example `arena no responde`, `nombre inválido`, `stdio listo`). Translating these changes observable log/protocol bytes and, for tool descriptions, model inputs. The session rule says: “Si un PR no se puede hacer sin cambiar comportamiento, no lo hagas: anótalo como deuda.” These translations therefore need a separate behavior-changing language scope. Do not change sentinel configuration values beginning `cambia-` as a language edit.

No source, test, prompt or assertion changed for this item; file sizes are unchanged. Before/after code tree: the same green develop tree (271/271 npm checks and 36/36 browser checks). The documentation PR reruns both checks. Risk avoided: changing operator/tool output or prompt behavior during a pure structural refactor.
