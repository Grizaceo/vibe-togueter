# Approved Seed Race transfer and separate runtime proposal

Prepared November 1, 2026. **Plan B remains the submission path. Nothing is deployed.** This package reuses the existing exact owner approval; it neither rebuilds Seed Race nor requests approval for the same source. No candidate code was imported or executed on the host.

## Reviewable transfer

Archive: `artifacts/seed-race/transfer/seed-race-approved.tar.gz` (15,551 bytes).

- Archive SHA-256: `04d88e1ceaf3aa1e28251c93d43aedbf286552a6ea8a37e9e69e97883125a18c`
- Trusted manifest SHA-256: `1ceffa68636a062e712173f11a607c01ca5b9aeb9d4c1da2a080216d1c8e43fe`
- Approved source: `f145319f61feb57ffbb41a0057954f5533b59d28caed10f3a625d751ef812105`
- Artifact binding: `e41cdbd68ccad078fb9ab33e35b7c95dadbc44db1177808c81c03f62e914f3f5`
- Approved normalized report: `3dcbc39f0eea93ba2acb134b421afb253227c6d5441163337bbb9656ae71165e`

The thirteen files include inert source, provenance, approval, historical quarantine report, three pinned PNGs, Kenney license/provenance, current trusted SDK executor, guest-only check harness, guest task and transfer manifest. There is no configuration, owner journal, OAuth/profile, model credential or deployment credential. This is transfer material, **not a runnable network service**. The current SDK differs from the historical quarantine SDK; its presence does not claim a new guest execution or runtime approval.

Reproduce using an output directory that does not exist:

```bash
node scripts/package-seed-race.mjs create /tmp/seed-transfer-review
node scripts/package-seed-race.mjs verify /tmp/seed-transfer-review 1ceffa68636a062e712173f11a607c01ca5b9aeb9d4c1da2a080216d1c8e43fe
node --test test/seed-transfer.mjs
```

Before using the archive, compare its digest to the value above, extract only this trusted archive into a new inert directory, and run the same verifier there. Repeat verification after transfer into a guest and before launch. The manifest digest comes from this trusted document, not from a replacement manifest delivered alongside altered files. Source, resource and report bindings are also checked independently of that transport manifest. The report's complete JSON frame is checked against the historical guest-evidence digest; it is never called live gameplay.

## Proposed one-hour private rehearsal lease — approval pending

Create **one new runtime VM**, `devbox:1`, `s-1vcpu-2gb`, default disk, separate from the destroyed builder/quarantine guests and both existing Rust VMs. No agent login/model call is needed. Keep ingress disabled, with a nonempty deny-by-default egress allowlist (`blocked.invalid` as in the trial), no host mounts and no personal credentials. Account availability/shape limits must be checked before any creation; the documented Free plan does not include this shape. Do not upgrade, top up or reuse another VM automatically.

Only the controller's operator channel would reach a narrow runtime bridge. The browser remains on Vibe Arena; it receives validated frame JSON and version-bound credit snapshots, never candidate JS. Twitch authentication stays in the controller; only bounded seed/water/wind actions and display names reach the guest. The controller enforces actor admission, frame limits, deadlines and reconnection/fallback. Keep game/art/idea credits outside candidate rendering. A missing/mismatched runtime version, expired lease or disconnect falls back to Marble Race. A hidden link alone would not enforce privacy.

This bridge is **not implemented**. Before spending or launch, implement/test its bounded protocol, private transport and runtime identity, then run the exact package with the current SDK in the new VM, verify reconnect/cancellation/version rejection and browser rendering. Existing artifact approval stays attached to its exact version; new runtime checks must be recorded separately. No studio worker dispatch is implied.

Lease proposal: explicit start time plus 60 minutes; require an independently active host cleanup timer before launching the guest. On expiry or interruption, stop access, destroy that exact runtime VM and query its terminal status. A failed cleanup is an unresolved liability requiring operator attention; never assume a pause or an elapsed observation timeout means destroyed. No automatic renewal, second VM, retry, paid API or bandwidth recharge.

Cost estimate, checked against [CreateOS limits/rates](https://createos.sh/docs/Sandbox/Limits/) and [pricing](https://createos.sh/pricing) on November 1: running vCPU $0.03616363/hour + 2 GiB RAM × $0.01159025/hour + disk $0.0001584/GB-hour. Allowing 11 GB for a nominal 10 GiB disk gives about **$0.0611/hour**, rounded to **$0.062 for one hour** of base usage. Proposed incremental spending ceiling: **$0.25**, including transfer/setup/cleanup time, with no top-up. This is an estimate and operator limit, not a provider-enforced cap or authorized spend. Taxes/account-specific charges and actual settlement remain unverified. Paused VMs continue memory/storage billing.

The old USD 3 trial ceiling does not authorize this proposal. Remain at **zero new spend** until a separate explicit hosting decision. No request to deploy is pending merely because this document exists.

## Judging access is a separate decision

A one-hour private Seed Race rehearsal does not meet continuous free judging access through November 15. Plan B can use the reviewed local games and documented Linux setup without deploying Seed Race. A stable hosted player still needs an owner-selected host, ingress, uptime responsibility and privacy/recording disclosure. No quick-tunnel address is promised as durable.

Keeping the proposed VM running November 2 at 17:00 UTC through November 16 at 02:00 UTC (one hour after the November 15 17:00 Pacific Standard Time judging close) is 321 hours: about **$19.93** at the rounded base rate, excluding other charges. This is a planning comparison, not a recommendation or authorization. Do not commit to this route under a one-hour lease or use it as the promised free judging service. Resolve hosting separately before publication.
