# Free judging-hosting review — November 1, 2026

Owner decision: the PC can stay on for a rehearsal, but should not be the judging host through November 15. Find a free alternative; human rehearsal remains deferred. The owner can create an Oracle account and asked whether the existing CreateOS account could serve instead. No account creation, deployment, publication or paid top-up is authorized by this research.

The Plan B host must run the reviewed Node controller and bubblewrap/user namespaces, preserve its journals, expose HTTPS/WSS independently of the PC, and keep judge access free through the evaluation. Seed Race and the automatic builder remain outside this deployment. A static site alone does not supply the live controller.

| Candidate | Verified offer/limit | Assessment for this repository |
|---|---|---|
| Existing CreateOS Sandbox | Usage pricing; promotional starting credits; no egress charge | Technically plausible, with prior guest execution evidence. Current credit balance, its applicable pool/expiry, current plan capacity and auto-pay state are not verified. A free account does not establish free continuous hosting. |
| Oracle Always Free VM | Persistent VM/storage allowance; home-region capacity can be unavailable; idle instances can be reclaimed | Candidate if a suitable instance is obtainable. Validate isolation on the actual VM. Idle reclamation is a real judging-availability risk; do not promise uninterrupted access or generate artificial load to evade it. |
| Google Cloud Free Trial | Eligible new users receive $300 for 90 days; no billing while the account stays a Free Trial; verification payment method required | Conditional alternative for this limited judging window. Verify eligibility, remaining credit/days and a console estimate before provisioning. The ordinary always-free VM allowance alone has a small network limit; do not treat it as unlimited hosting. |
| Render Free | WebSockets supported; services sleep after 15 minutes idle; local filesystem is lost on restart/sleep; no free persistent disk | Does not preserve this controller's current disk journals. Switching persistence would require engineering; isolation compatibility is also unverified. Not a drop-in route. |
| Koyeb Free | 512 MB, 0.1 vCPU; no attached persistent volume; scales to zero after an hour without traffic | Does not meet current persistence requirements. Isolation compatibility and sufficient game capacity are unverified. Not a drop-in route. |

Primary sources checked: [CreateOS Sandbox pricing](https://createos.sh/pricing/sandbox), [Sandbox limits](https://createos.sh/docs/Sandbox/Limits/), [CreateOS account billing](https://createos.sh/docs/Account-Billing/Pricing/), [Oracle Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm), [Oracle Always Free limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Google trial](https://docs.cloud.google.com/free/docs/free-cloud-features), [Render Free](https://render.com/docs/free), [Koyeb instances](https://www.koyeb.com/docs/reference/instances).

## Answer to “does CreateOS also work?”

Yes, technically. Start with the existing account's Billing view before creating another account. The documented 1-vCPU/2-GiB/10-GB base rate is about $0.06093/hour: **$19.56 for 321 hours** (November 2 17:00 UTC to November 16 02:00 UTC). Rounded conservatively to $0.062/hour, that is **$19.90**. Starting earlier increases the duration. This is a usage estimate, not new spending permission or a settled invoice; it excludes other account workloads and potential account/plan charges.

A read-only CLI inventory found **two running sandboxes**. Neither was changed. The current CLI `whoami` did not produce a usable JSON billing summary. A filtered text follow-up showed the general account plan as **Free**, with no balance; Sandbox-specific capacity and account balance were **not established**. Do not equate that profile label with live Sandbox limits when two VMs already exist. No raw profile or error output was disclosed. The published 500-credit starter offer is not proof of the account's remaining balance, recurrence, expiry or sufficiency. Do not infer dollars or sandbox-pool eligibility from a different product's credit example.

Needed next: the usable Sandbox balance (preferably its displayed dollar equivalent), any expiry, the applicable plan/concurrency limits and whether automatic top-up is off. These are billing facts, not secrets. Never request card details, auth tokens or configuration files. If the verified existing free/promotional balance covers the whole period plus other workloads and a reserve, prepare a bounded CreateOS deployment for review with no top-up. Otherwise use a qualifying free VM/trial alternative; do not purchase credit or quietly upgrade the account.

## Acceptance before any public launch

1. Identify the account, exact free offer, end date and resource limits without transferring master credentials into game guests.
2. Use a separate deployment copy of Plan B reviewed files. Preserve owner journals; exclude inert candidates, private credentials and external Rust runtimes.
3. Test Node version, usr-merged paths, bubblewrap/user namespaces, watchdog/fallback and disk persistence in the actual host. Fail closed if isolation is unavailable.
4. Configure HTTPS/WSS, restrict operator access and verify publicly forwarded admin requests remain denied. Credentials are supplied privately by the owner or scoped deployment tooling, never pasted into evidence.
5. Complete the host/region/provider disclosure and operator retention/deletion decision; verify free judge access, fresh-session browser play and restart recovery.
6. Set the agreed expiry/cleanup for after judging, monitor credit and availability, and keep a recovery/backup path. A provider's free label is not an uptime guarantee.

This review selects no provider yet and deploys nothing. The immediate question is whether the existing CreateOS credit is sufficient; an Oracle signup is not required merely to answer it.
