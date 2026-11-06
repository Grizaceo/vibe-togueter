# Streamer-controlled builder preparation

**Real verification passed:** owner-approved one-guest check exercised actual prepare-during-voting, +15-minute renewal, exact pause/resume and close; independent provider observation confirms destruction. No model, completed login or candidate was used. [Receipt](../evidence/prewarm-real-control-verification-v2.json).

Implemented, default disabled. The streamer can prepare an isolated builder during idea collection, voting or design discussion, then start construction after approving the exact inputs. No model call is used for preparation or to keep the environment ready.

## Streamer flow

1. With an approved allocation configured, unlock private Studio controls and choose **Prepare VM**. This creates one private guest, installs/checks the coding environment and arms independent cleanup. It does not approve an idea or start Codex.
2. Complete one fresh OpenAI device login using the protected local instructions file shown by the owner control. The session remains inside that exact guest; no host auth is copied.
3. The Studio shows remaining time and the approved maximum. **Keep ready +15 min** extends the durable deadline up to that maximum; **Close VM** destroys the exact guest. The final minute cannot renew. There is no indefinite keep-alive or automatic replacement.
4. While prepared and the controller is active, a trusted heartbeat every minute keeps the guest ready. Provider pause is only a cost fuse: a paused guest is destroyed by the external supervisor, never resumed, and a new preparation needs a new owner decision. A failed observation produces a warning. A controller outage falls back to provider idle pause and independent cleanup.
5. After exact input approval, **Build approved inputs in VM** performs its readiness check itself. It requires at least seven minutes left; extend first if necessary. Once the build claims the guest, warm controls hand off to job cancellation/cleanup. Every build remains a separate one-use decision.

The environment can stay available while a discussion continues, within the displayed approved lifetime. Preparing early moves setup/login out of the post-vote wait; generation and separate testing still take time. The earlier real Lantern Table run used automatic authentication detection and reached tested/cleaned state about 63 seconds after dispatch. It did not exercise these new Studio lease controls.

## Configuration and budget boundary

The shipped `build.studioWorker.enabled` and `prewarmEnabled` are false. For an explicitly approved run, the private operator configuration requires a unique `approvalId`, `vmBudgetMinor` between 25 and 300, and `maxWarmMinutes` between 30 and 180 (default 60). These controls are available only in cloud-vm mode; no host fallback exists. A preparation decision already used by a job cannot create a replacement guest. A failed preparation also consumes its decision and needs reconciliation/new explicit allocation.

At the previously verified shape rate of about USD 0.0611/hour, even the 180-minute hard maximum plus a five-minute distinct test guest is roughly USD 0.189 base compute/storage, within the minimum 25-cent reservation. This is a rate assumption and an operator limit, not a provider-enforced money cap, settled invoice or estimate of unrelated VMs. No top-up, plan change, paid API or new live extension was performed to test this feature.

## Cleanup and race handling

The recurring external timer is armed before creation and is never disabled to renew. Scheduled cleanup checks a durable bounded deadline. Renew, build claim and close contend for the next immutable decision file using atomic same-filesystem hard links. A suspended writer cannot overwrite a winning decision; a concurrent renewal does not leave a stale close marker. Explicit close and build admission have one winner. Expiry cleanup can still close a claimed build at its deadline. Local disk/control-plane outages can require operator reconciliation; they are not permission to replace the guest.

A partial write after a durable build claim is recovered through the exact lease claim plus session/VM identity. Destruction still verifies ownership. Existing legacy direct-login helpers remain usable without opting into warm controls. Login instructions stay private and do not appear in public snapshots.

## Verified scope

Local/mock tests cover disabled/unauthorized operations, one-use decisions, immutable deadline caps, delayed writers, close/renew/claim races, minimum 30-minute setup, timer/provider uncertainty, claimed-job ownership, failed session persistence, scheduled cleanup retention, bounded heartbeat and paused-guest destruction. Disposable Chromium exercises production prepare/extend/close handlers with explicitly mocked HTTP and the default-off state; no real VM or candidate is executed by that browser fixture. The read-only closing review found no remaining actionable issue. Actual preparation during a ballot and exact 15-minute renewal succeeded in a separately approved live check. Its fixture stopped on an empty pause acknowledgement before resume observation; exact destruction was independently reconciled. [Current live verification record](PREWARM_CONTROL_VERIFICATION.md). A separately approved repeat then completed pause/resume/close; its receipt is linked above. The earlier real build/test/cleanup and roles evidence remain separate.
