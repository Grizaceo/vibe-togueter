# Vibe Togueter — temporary Railway game trial

Status: **Railway trial blocked for this account**. The one authorized creation
attempt was rejected before any resource or remote Rust build existed.

The platform implementation remains Vibe Arena. The owner's separately developed
teeworlds-rs game (Cristóbal Muñoz with Devin and Hermes) is an external example,
not hackathon game code authored with Codex.

**A dedicated public URL/custom domain for the Vibe Togueter platform is pending.**
A temporary provider hostname, if deployed and verified, is only the address of this
external-game integration trial. It is not permanent platform hosting, a submitted
judge URL or a claim of availability through November 15. No custom domain purchase,
repository publication or change to the frozen submission is authorized by this plan.

The planned flow is real Twitch `!join` → HTTPS entry page retaining platform/game
credits → the viewer's individual browser tee → WSS to the same VM game as the
owner. No collective chat tee or spectator buff is substituted for this flow.

Railway's normal service domains provide HTTPS and WebSocket upgrades. Its anonymous
`ssh railway.new` preview is restricted to the creator's IP until claimed, so that
anonymous mode does not establish external viewer access. The owner has reported an
existing Railway account/trial; available credits and spending authority must still
be confirmed before creation or building.

Sources reopened November 2:
- [Public networking](https://docs.railway.com/networking/public-networking)
- [WebSocket limits](https://docs.railway.com/networking/public-networking/specs-and-limits)
- [Trial terms](https://docs.railway.com/pricing/free-trial)
- [Anonymous VM preview restrictions](https://railway.com/free-vm)

The concrete deployment package, authorization envelope, test results and sanitized
deployment receipt will be recorded here as preparation progresses. No tokens or
login instructions enter build logs or screenshots.

## Account read-only checkpoint

The owner authenticated the local CLI and reported USD 5 trial credit. The API
confirmed: registration REGISTERED, trial active with 30 days remaining, balance
USD 5, no ban reason, no account flags, and no connected GitHub account. Its
subscription limits advertise code builds, 2 vCPU / 1 GB per service, 2 provider
domains and 20-minute hard build timeout. These metadata are not proof that an
actual build/deployment is admitted. User `isVerified` is false; this alone is not
treated as an authoritative Limited Trial determination.

The official status page still reports paused new signups after the October 21
incident. Existing authenticated-account API reads succeed. No resource has been
created as a diagnostic, and no upgrade/card/top-up is authorized.

## Concrete trial package

- One fresh project/service/replica, normal Railway trial deployment, provider
  HTTPS hostname; zero models, agents, databases, volumes or public repositories.
- External source base `172cfef`, with changes isolated in game branch
  `feat/vt-remote-demo-20261102`: strict complete postcard decoding, loopback game
  bind in demo mode, disabled HTTP administration, bounded sockets/input and no
  report/debug/chat/voice commands in this narrow public trial. No gameplay mode
  is invented. DM with zero bots supplies the existing movement/hook/fire mechanic.
- Build WASM first and embed it in the server from the same exact source revision.
  Record source revision, binary/WASM hashes and contract version 1 in a manifest.
- A narrow Node gateway serves the credited platform entry, browser game/WSS and
  real backend health. All other HTTP routes and mutation APIs are rejected.
  No Twitch, account or admin credential is transferred to the service.
- The Twitch bot remains private on the owner's PC and will reply to a manual
  `!join` with the temporary public HTTPS entry URL after health/protocol gates.
- Runtime lease at most 30 minutes, restart policy NEVER; an independent local
  cleanup timer owns a random, explicit project creation intent and deletes only
  that exact trial project. Deletion acceptance is not terminal; poll inventory
  until its absence is verified. Unknown creation/cleanup blocks another trial.

Owner authorization received November 2: one cloud build/deployment, at most
30 minutes total from project creation, at most USD 1 of the existing USD 5 trial
credit, USD 0 paid charges, no upgrade/recharge/card. Stop and clean up if account
restrictions or the build gate fail; no replacement provider/VM or automatic retry.
The USD 1 threshold is an operator stop limit, not a provider-enforced per-project
cap or a settled invoice. Workspace-wide billing settings are not changed because
they may affect unrelated services.

## Actual attempt and result — 19:13 UTC November 2

Independent cleanup supervision was armed before a unique project creation intent.
The authenticated CLI then rejected project creation:

> Trials are temporarily paused for new accounts. Upgrade to a paid plan to start deploying.

No service/domain/VM was created; no source was uploaded and no remote build ran.
Authenticated inventories before and after the attempt were both empty. The cleanup
check independently confirmed the intended project absent, marked the private lease
terminal, and only then stopped its timer. There is no pending guest/project cleanup.
The credit API still reported USD 5 after the attempt; no settled invoice is claimed.

No paid upgrade, recharge, card, replacement provider or automatic retry occurred.
The provider restriction overrides the apparently available trial metadata. A new
provider/account or paid-plan decision requires a separate explicit authorization.

Prepared platform source is `9897e40` on `feat/tee-vm-trial-20261102`; the isolated
external game revision is `0c6250d86c59d7ec166ded0785baef51529fb9ec` on
`feat/vt-remote-demo-20261102`, based on `172cfef`. The inert package under `/tmp`
was assembled from committed source and contains no host auth/environment files.
Local validation passed 282 npm checks (172 focused + 110 integration), 36 Chromium
checks, a Rust server compile check and one strict-codec Rust test. Gateway fixtures
verify boundaries only; none constitutes a deployed VM/WSS game trial.

The dedicated platform URL/domain remains **pending**. The verified human local
Twitch-entry result from the earlier increment remains valid and is not promoted
to a remote deployment claim by this failed provider attempt.
