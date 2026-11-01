# One bounded golden-path verification run — owner decision pending

Prepared November 1, 2026. No VM/model/resource changes have been made in this increment. The eight earlier trial guests are destroyed; no reusable guest login remains. HOSTING_POLICY.md and SEED_RUNTIME_PROPOSAL.md explicitly distinguish the historical USD 3 trial from future hosting authority. This run can use only a separately confirmed unspent allocation, never an account top-up.

## Reviewable operation

Reserve at most **USD 0.25 of the already-approved remaining VM budget**, subject to owner confirmation that it remains available and the account can create the required shape. No plan change, paid API request, new provider account or bandwidth recharge. One fresh `devbox:1` / `s-1vcpu-2gb` builder guest (ingress closed; coding/auth/registry egress allowlist) gets an independent 30-minute cleanup timer. Owner completes fresh device-code subscription login inside that guest; no host auth/profile is copied and no code/token enters evidence. Use the previously selected **gpt-6.1-terra**, low reasoning, one invocation, five-minute command deadline, no automatic model retry.

The studio supplies its actual approved round/resource manifest. The result stays inert in quarantine. Destroy and verify the builder, then create at most one distinct test guest, ingress closed and deny-by-default egress, with a separate five-minute external cleanup timer and a finite trusted SDK test harness. Transfer only candidate/resource bytes and the trusted harness; no coding or Twitch credentials. Confirm provider terminal destruction for both guests; uncertainty blocks replacement. Existing Rust VMs are excluded.

No game runtime is provisioned, no candidate runs on the PC, and no external publication is authorized. The successful end state is reviewed local publication evidence after exact source/artifact/report approval. It must explicitly say the artifact is not live gameplay. A separate runtime/public-host decision remains outside this run.

## Cost and access limits

The [provider limits/rate page](https://createos.sh/docs/Sandbox/Limits/), reopened November 1 at 21:57 UTC, quotes vCPU/RAM/storage rates totaling approximately $0.0611/hour for this shape with an 11-GB conservative disk allowance. Thirty minutes of builder plus five minutes of testing is about **$0.036 base usage**. The $0.25 reservation allows setup/cleanup margin; it is an operator stop limit, not a provider-enforced spending cap or settled billing. Paused RAM/storage still accrue cost. The separate rate-card URL did not load in the research tool; use the successfully retrieved limits page and verify the actual account terms before creation.

Account capacity and usable balance are not established. The documentation's Free shape/concurrency limits do not prove this existing account can run the requested shape, especially with two unrelated live VMs. Do not upgrade or disturb them. If balance/capacity or guest authentication cannot be verified within the authorization, keep the worker disabled and Plan B primary.

## Commands and evidence gates

The existing reviewed helper `node scripts/builder-login.mjs prepare` creates the bounded fresh login guest; `status` checks only the safe authenticated boolean, and `release` destroys the exact journaled guest. It may run only after the owner decision. The studio adapter must additionally pass mocked lifecycle/authority/cancellation/restart tests before being enabled. One successful real run must record approved input hash, actual VM/model receipts, inert source hash, distinct test-VM report, exact approval and confirmed cleanup. Mock output cannot satisfy the November 2 10:00 UTC gate.

Device login instructions are displayed to the owner locally and never read into the model. Official [headless authentication](https://learn.chatgpt.com/docs/auth) and [non-interactive CLI](https://learn.chatgpt.com/docs/non-interactive-mode) documentation were fetched alongside the installed CLI help. Their existence does not establish account model access or authenticate a guest. The owner's prohibition on copying auth caches remains in force.
