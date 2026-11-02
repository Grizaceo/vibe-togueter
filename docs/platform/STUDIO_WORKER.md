# Experimental studio-to-VM worker

Status: implemented behind **`build.studioWorker.enabled: false`**, with mocked lifecycle/provider tests only. No new VM, model invocation, fresh guest authentication or reviewed real publication has occurred in this increment. Plan B stays primary. The earlier Seed Race operator trial remains separate historical evidence.

## Connected code path

Private Studio controls check a fresh authenticated builder lease, dispatch the exact approved round/resources, show progress, cancel, reconcile cleanup, inspect source/report/static test frame, and approve the exact artifact/report to save local reviewed publication evidence. Public Studio/overlay snapshots show stage without candidate source, process handles, authentication or approval keys. Browser/game play keeps using the reviewed bundled games throughout construction.

The controller is a trusted supervisor. `StudioBuilds` owns a durable job journal and uses the existing canonical rounds/quarantine stores. `CreateOSStudioWorker` runs only fixed provider commands. It claims one fresh prepared builder, invokes gpt-6.1-terra once by subscription, reads the result as inert UTF-8 text, confirms builder destruction, then creates a distinct isolated test VM. The test VM receives candidate text, a trusted SDK harness and pinned bundled PNG bytes. Its nine checks cover source/resources, identity, SDK callbacks and frame paths; they do not establish human gameplay quality. Candidate callbacks never run in the controller or browser.

Approval requires the current completed inputs, exact artifact/report hashes and rights attestation. Added community credit is part of the new artifact binding. A reviewed evidence JSON under docs/evidence/ is the publication result; **no runtime is deployed**. Existing approved Seed Race bindings and inert archive remain untouched.

## Cancellation, recovery and leases

Both guest creation paths arm independent recurring user-manager cleanup before admitting creation. The builder uses a private per-lease journal and 30-minute initial cleanup deadline. The test guest uses a unique name/ownership journal and five-minute initial deadline. Reconciliation retries every 30 seconds until terminal state is established. Expired producers reject delayed creation; in-progress creation intent cannot retire its own supervisor. Only explicit abandonment before sending creation, or verified terminal destruction, permits cleanup supervision to stop.

Cancellation remains pending until destruction is confirmed. Lost observations re-poll the same process identity; there is no model or VM replacement retry. Restart marks interrupted jobs uncertain. Terminal quarantine decisions are idempotent during cross-store reconciliation, so a later journal failure does not trap cleanup forever. One spending approval ID can dispatch only one job. Unknown cleanup blocks another writer; a failed fallback never switches construction to the PC. Provider/control-plane or host outages still need operator attention: these leases are supervised cleanup, not a provider-enforced money cap or uptime guarantee.

## Before any real enablement

1. Confirm available Sandbox balance, account shape/concurrency capacity and the existing budget allocation. [Bounded run proposal](INCREMENT_VM_RUN_PROPOSAL.md). No new payment account, top-up, plan change or paid API use is authorized.
2. Prepare a fresh builder with `node scripts/builder-login.mjs prepare`. The helper puts device-login instructions in a restricted local file; the owner reads/completes them locally. Never copy host auth caches or put codes/tokens in evidence. Use `status` for the safe authenticated boolean.
3. Only after that decision, set a unique owner decision ID and the explicitly reserved minor-unit VM amount in the private operator configuration; the proposed minimum reservation is 25 cents. Enable only cloud-vm mode. The code accepts no chat-selected provider, shape, model, budget or local fallback.
4. Run the actual approved Studio round through dispatch, separate tests, source/frame/rights review and exact approval. Record real VM/model/report/cleanup identities; all current worker tests are mocks and do not satisfy this gate.
5. By November 2 10:00 UTC, without a complete real run, retain the disabled default and Plan B script. At 15:00 stop feature work; a separate future runtime and public hosting remain owner decisions.

The CreateOS CLI v0.0.31 installed commit was checked against its public source for managed process result fields and JSON behavior. Official [process API](https://createos.sh/docs/Sandbox/REST-API/Managed-Processes/), [limits](https://createos.sh/docs/Sandbox/Limits/), [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) and [headless authentication](https://learn.chatgpt.com/docs/auth) informed the adapter. No source prose/code was imported.
