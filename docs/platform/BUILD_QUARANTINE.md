# Build artifact quarantine journal

Implemented November 1, 2026 in Codex session `01a19776-75a5-7e91-b5c1-f108c345dc8c`. This is a working owner-operated handoff increment toward the VM build journey, not a connected coding worker or a complete publication pipeline.

## Implemented boundary

`src/build-quarantine.js` stores candidate JavaScript as inert JSON under ignored `runtime/build-quarantine.json`. It never imports, evaluates, installs, serves or deploys candidate code. Source must be nonempty and at most 128 KiB of UTF-8 bytes; the caller's SHA-256 must match. Receiving the same source is an idempotent retry. Replacing it requires cancelling/rejecting the ticket and issuing another. There is no ZIP extraction, arbitrary file path, dependency installation or resource download.

Tickets require the current streamer-approved community round. They pin its ID, approved input hash, full credit/resource manifest, owner-selected profile identifier, build VM identifier and distinct public-runtime identifier. VM/profile identifiers are **operator declarations**, not provider discovery, verified ownership or installation evidence. Issuing a ticket does not dispatch work, reserve/spend funds or change the round to building.

Artifact approval binds the source hash, round input hash, resource fingerprint and test-report hash. The HTTP route rechecks the canonical current round before issue/approval. A completed construction round may receive final artifact approval if its exact canonical input hash still matches; it cannot issue a new ticket without an approved input round. A changed or cancelled round cannot approve the old ticket. Candidate game text and report text cannot grant owner permissions.

A test attempt has a random nonce. A report must match the artifact and active attempt, attest a distinct quarantine VM and provide 1–100 named boolean checks plus an evidence-file SHA-256. All checks must pass, and the owner must attest rights, before journal approval. **These reports are explicitly operator-attested.** The controller does not contact a VM, verify receipt contents against the hash or authenticate a worker signature. A fabricated local-owner report is not prevented by this increment; it is never presented as verified isolation or a safety certificate. Arbitrary approved candidate source remains unexecuted and unpublished.

Retesting revokes approval and preserves previous success/failure receipts. Restart during testing records an interrupted attempt and enters `reconcile-required`; late receipts are rejected and a new nonce is needed. Cancellation/rejection also preserves attempts and rejects late writes. These actions affect the journal only; there is no connected worker to stop. Up to 32 tickets and 16 attempts per ticket are retained; reaching a limit blocks additions rather than silently discarding evidence. Writes use mode-600 temporary files, fsync and atomic rename, with in-memory rollback on persistence failure. Existing controller leasing prevents a second server writer; standalone callers must share that ownership discipline. Filesystem corruption fails recovery without overwriting the original file.

## Local operator interface

`GET /admin/build-quarantine` returns metadata without source/report/history. `POST` accepts `issue`, `inspect`, `receive`, `begin-test`, `record-test`, `approve`, `cancel` and `reject`. Both methods require the existing local admin authorization and private `x-streamer-key`; forwarded/public requests are denied. No viewer-agent credential or public submission endpoint was added.

Use the helper from the repository root. It reads keys from protected configuration, permits only a loopback HTTP origin, refuses redirects and excludes source from console output:

```bash
node scripts/quarantine-admin.mjs list
node scripts/quarantine-admin.mjs request.json
node scripts/quarantine-admin.mjs inspect-request.json --save-review review-new.json
```

`--save-review` creates a new mode-600 file containing the complete source and evidence. Existing files are never overwritten. Keep request/review files under ignored `runtime/`, not in tracked examples. The JSON file is data, not a script. Helper errors do not echo provider response bodies or credentials.

Request schemas (replace placeholder IDs/hashes with the reviewed values):

|Action|Additional JSON fields|
|---|---|
|`issue`|`buildVmId`, `runtimeVmId`, `agentProfile`; current approved round is read by the server|
|`inspect`|`id`|
|`receive`|`id`, `source` (exact text), `expectedCodeSha256`|
|`begin-test`|`id`, `artifactHash`; response returns the nonce and immutable artifact|
|`record-test`|`id`, `report: {artifactHash, testNonce, testVmId, isolatedVmAttested: true, evidenceSha256, checks: [{name, passed}]}`|
|`approve`|`id`, `artifactHash`, `reportHash`, `rightsAttested: true`|
|`cancel` / `reject`|`id`|

Do not execute the exported candidate on the host, including through the inherited `node:vm` loader. Actual testing belongs in a separately owned quarantine VM without personal profiles, Twitch credentials, host home mounts or privileged secrets. Only record real test evidence as real; automated fixture reports in this repository are labeled accordingly.

## Verification and remaining work

Thirteen focused tests exercise inert malicious source, byte/hash bounds, immutable retry, resource-manifest binding, stale approvals, passing/failing reports, replayed nonces, interrupted recovery, durable rejection/cancellation, history preservation, corruption and disk-write rollback. Thirteen additional checks exercise actual local HTTP and the operator CLI in the existing temporary-copy harness. The candidate intentionally throws if executed; it is never installed as a game. CLI export/private mode and overwrite/remote-origin refusal are checked. These are local tests with fixture VM IDs/reports, not guest execution.

Read-only adversarial review reproduced two P2 issues (lost reports on retest and rejection before receipt); both were fixed with red-to-green regression tests, then re-reviewed. Failed attempts remain in `docs/evidence/quarantine-review-red.txt` and `quarantine-first-suite-failure.txt`.

Still required: authenticated worker dispatch/profiles, VM ownership and egress policy, budget reservations and actual expense reconciliation, isolated dynamic execution and relevant security/license checks, worker receipt verification, source/input export contract, approved-artifact deployment to a separate runtime, creator-byte verification on that deployment, viewer-agent intake and review UI. Existing trusted manual loading and trusted-local generation remain explicitly trusted paths; this journal does not retrofit them into an untrusted runtime. That initial journal increment itself made no VM, provider AI, payment or public deployment call. The subsequent [operator VM trial](VM_TRIAL.md) supplies real guest construction/test evidence and owner artifact approval; general worker dispatch/deployment remains pending.
