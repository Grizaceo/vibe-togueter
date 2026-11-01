# Version-bound game, art and idea attribution

Every lobby and OBS page has a permanent three-role credit strip outside the game canvas and outside the expandable license panel. It names game authors, artists and idea authors. Missing records remain visibly pending; a changed version never inherits another version's names. Creator links use the existing public HTTPS policy, rejecting private-host literals, URL credentials and authentication query parameters. Explicit artists and resource-manifest creators are merged; using one curated image must not hide another contributing artist.

Bundled games have participant-authored credits.json records pinned to source SHA-256. Grove also pins the three actual PNG fingerprints. “Vibe Arena participant” identifies the project participant without inventing an outside collaborator; the notice distinguishes the Devin-assisted prototype from later Codex implementation. These demo examples do not claim a real community ballot or creator signup. The owner should replace this generic participant display name with their preferred public attribution after confirming provenance.

For an external reviewed local SDK game, POST /admin/game-publication action=publish accepts contributors with nonempty gameAuthors and ideaAuthors arrays of {name,url?}, optional artAuthors and an artNote. Pass the exact reviewed source hash and resource IDs (an empty list is valid for code-drawn art). Authors are required if no matching bundled record exists. The private local route still requires both admin authentication and streamer confirmation. Arbitrary cloud artifacts remain in the separate quarantine/VM flow; this metadata path is not an upload execution gate.

Resource publication, source reload and bundled-resource filesystem events refresh one server snapshot. Public /community/game-credits only serializes that snapshot; it does not read or hash source/artwork for each caller. Clients receive t=credits at connection and when that snapshot changes. There is no credit fetch timer. Resource events are debounced by 25 ms; during a source transition the client checks the executing hash before displaying names. Filesystem watch errors fail attribution closed. This is local filesystem invalidation, not a distributed immutable asset service.

Verification:

- A reader-count regression exercises 10,000 snapshot accesses with one verification call.
- HTTP/WebSocket integration changes actual PNG bytes, observes attribution invalidation, restores the exact bytes and observes recovery. A source edit cannot reuse prior game/art/idea authors.
- A synthetic external vibecoder/idea-author publication works without an external art pack. DOM tests retain both explicit and manifest artists with details closed.
- Automated Chromium at 1600×900 used the production keyboard handler to plant a tree. Lobby, overlay, studio and privacy screenshots were visually inspected. Both viewport axes are checked for the credit strip; no credit polling or browser JavaScript exception occurred. This is automated local browser evidence, not human play, Twitch activity or OBS footage.

The first visual inspection found the overlay canvas pushing the sidebar beyond the right edge; min-width:0 and a fixed sidebar basis corrected it. The original geometric check covered only vertical position; the revised check includes left/right. An auxiliary edit temporarily overwrote a test file; it was restored from Git and the intended new cases reapplied. Logs /tmp/vibe-credits-final.log and /tmp/vibe-credits-cache-final.log retain that failure and a later cache-status mismatch. The final snapshot preserves “unavailable” distinctly from “unreviewed”.

A frame-schema review also found nested candidate fields causing recursive controller serialization and external sprite URLs causing viewer-browser requests. Transport now projects only flat supported SDK primitives; renderer sprite loads accept bounded local curated PNG paths only. Actual guest-depth and external-URL regressions cover those failures. The 96 MiB runtime setting remains a V8 heap setting, not an OS RSS or tmpfs quota.

Final full suite: **97 focused + 82 integration = 179 passing checks**, zero failures; docs/evidence/credits-tests.txt. The separate Chromium rehearsal has eight checks and is not added to npm totals.
