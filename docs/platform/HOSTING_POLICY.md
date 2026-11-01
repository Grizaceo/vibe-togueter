# Streamer-controlled hosting and VM inactivity policy

Owner requirement recorded November 1, 2026. The owner is opening an Oracle account and continues to defer human rehearsal. This document extends the full product requirements; it does not change Plan B or claim that the general builder/runtime adapters are connected. No cloud resource was changed to write it.

## Hosting choices

The platform/controller, build agent and game runtime are separate workloads. Their placement is a streamer decision, never a chat/model instruction or an automatic response to a provider failure.

| Workload | Default target | Explicit self-hosting option | Present implementation boundary |
|---|---|---|---|
| Platform/controller | Cloud VM | Streamer's own VM, Docker container or native PC process | Native Linux execution is implemented and locally tested. A public hosted instance, tested Docker deployment and general remote-game-VM connection remain pending. |
| Generated/contributed game | Separate cloud runtime VM | Separate VM inside the streamer's PC | Local hypervisor integration is pending. A host process, Docker container or `node:vm` realm must not silently substitute for this game VM. Reviewed bundled SDK examples currently use the documented Linux namespace process; that is a separately identified trusted-demo path. |
| Coding agent/build | Separate cloud build VM | Explicit local build VM; existing trusted-local development remains a distinct owner choice | Specialized operator VM trials exist; general dispatch is unconnected. Local construction is never an outage fallback. |

A self-hosted platform can control a cloud game VM; a cloud platform can control an owner-hosted game VM if the connection is deliberately configured and verified. Platform placement does not weaken the game's isolation requirement. Build and runtime VMs remain separate, including when both are local.

Before enabling a local mode, the streamer accepts the concrete exposure: the machine and internet connection become part of availability and attack surface, CPU/RAM/disk/network compete with streaming, and virtualization does not eliminate host/hypervisor risk. Record the selected mode and acceptance version/time in a private owner setting. This is a decision, not an assertion that risk is eliminated. Allow the streamer to revoke the mode and stop its workloads. A gaming PC may have enough capacity, but actual headroom during OBS/gameplay must be measured rather than assumed.

Local game VMs receive explicit CPU, RAM, disk and network limits; no broad host-home/shared-folder mount, personal profiles, Twitch refresh tokens or provider master credentials. The platform owns persistent decisions and creator attribution outside candidate-controlled code. Self-hosting does not grant an artifact permission to publish itself or reuse approval after its source/resources change.

## VM timeouts: enabled by default, streamer configurable

The product must enable an inactivity policy on managed VMs by default. Streamers can change the thresholds and actions, including an explicitly acknowledged always-on mode, separately for build, game and platform hosting. Selecting an always-on judging host is not the same as disabling all game-VM limits. Show the effective policy, next deadline and estimated remaining usage in owner controls.

Initial product defaults for new **game runtime VMs**: pause after **5 minutes of inactivity** and destroy after **30 minutes of total inactivity**, including time paused. These are future runtime-adapter defaults, not settings already applied to existing VMs. Destruction requires durable approved source/resources and recoverable platform records; do not delete the only copy of a user's work. Display state-reset consequences before enabling destructive expiry. Resume/recreate stays inside the configured provider/budget/approval policy, with no local-process fallback.

A build additionally needs a finite job deadline and an independent cleanup lease. The historical builder trial used provider auto-pause at five minutes and an independently checked thirty-minute cleanup timer; those were trial-specific controls, not a general runtime supervisor or authority to rerun/spend the old budget.

Platform-host inactivity is separately configurable. Pausing the only controller also pauses its own ability to wake itself, serve judges or supervise guests. Before enabling that action, provide an external management/wake/cleanup path and clearly disclose the resulting availability. A platform hosting choice must not silently inherit a short game-VM timeout. Judge access through November 15 remains a requirement; idle policies must be chosen together with an actual wake/recovery plan.

[CreateOS documents](https://createos.sh/docs/Sandbox/Limits/) provider auto-pause, but a pause stops only vCPU billing; RAM/storage continue. Its [rate card](https://createos.sh/pricing/sandbox) remains usage-based. Therefore the owner panel must distinguish running, paused, destruction requested, destruction confirmed and cleanup requiring attention. An elapsed timer, lost connection, failed status or deletion acknowledgement alone cannot be called zero cost or successful destruction.

## What counts as idle

Use accepted participant/streamer activity and the intended live game/session state, not arbitrary process CPU, periodic frame broadcasts, health checks, credit refreshes, polling or WebSocket pings. Rejected flood traffic must not extend a VM's life. A round still deliberately playing should not be paused mid-race merely because viewers stop pressing buttons. Apply a separate finite owner-selected lease/budget deadline so an untrusted game cannot claim perpetual activity to avoid shutdown.

The application-level policy and the provider's activity definition are different. Record both, verify their interaction against the actual provider, and never claim that one `--auto-pause` flag implements the full application policy. Once paused, continuing the destroy countdown requires an external supervisor rather than a timer inside that paused guest.

## Lifecycle and ownership invariants

1. Only a local authenticated streamer can change desired hosting/timeouts, with explicit confirmation for self-hosting/always-on modes. Viewer text and candidate code cannot change placement, lease, budgets or risk acceptance.
2. Apply new defaults to newly managed resources. Changes to existing leases need an explicit, identified owner operation. Legacy VMs owned by other projects are not automatically enrolled or terminated.
3. Persist the exact managed VM identity, provider/account scope, policy revision, last meaningful activity, absolute expiry and cleanup ownership. Reconcile after controller restart and preserve uncertainty after a provider timeout; never create a replacement solely because observation expired.
4. Pause/resume/destroy operations must be idempotent and serialized against activity, shutdown and deployment transitions. A late activity event cannot revive a destroyed or expired lease. Policy changes invalidate superseded timer work.
5. Verify the provider's terminal state before releasing a lease/reservation. Cleanup failure remains visible and blocks blind replacement. Do not rely on an idle timer running inside the VM it must destroy.
6. Preserve source/resource/report approvals and game/art/idea credits across placement changes. Runtime identity and actually executing source version must match before sending player actions or showing that version's credits.

## Acceptance gates for implementation

- Persistent streamer settings and owner UI distinguish desired placement from actual connected deployment. Unsupported modes remain visibly unavailable; saving a preference must not be represented as a migration or launch.
- Test timeout defaults/overrides, accepted versus rejected activity, active rounds, paused-time destruction, absolute lease expiry, policy changes, restart recovery, failed deletion, delayed provider replies and foreign-VM rejection with a simulated clock and mock provider first.
- Test each real provider's idle/wake/cleanup behavior only under its separately authorized resource/spending scope. Existing Rust VMs and the already-approved Seed Race are not disposable test fixtures.
- For local VM self-hosting, demonstrate the actual hypervisor boundary, resource limits, host-mount/credential exclusions, disconnect/reconnect, shutdown and browser/chat path. A configuration file or screenshot alone does not establish this mode.
- For Docker platform hosting, verify persistence, operator access and isolation support. If a required kernel feature is unavailable, fail closed or use the configured separate game VM; do not silently weaken the boundary.
- Record cloud, native, Docker and local-game-VM results separately. No self-hosted Seed Race execution or new deployment was performed for this requirements update.

Implementation order: keep the Oracle Plan B deployment work separate; add durable policy/settings and an externally supervised provider lease adapter; connect cloud/local game runtimes; validate Docker/local-hypervisor deployment; only then expose verified placement choices as operational controls. These remain engineering tasks, not a completed automatic builder.
