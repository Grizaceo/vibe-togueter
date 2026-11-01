# Demo reorientation — November 1, 2026

## Decision: Plan B

Show the working community studio and reviewed games, followed by the real operator-run Codex VM trial. The intended golden path remains: chat proposes → votes → streamer approves inputs → Codex builds in a separate VM → quarantine/tests → streamer approves the exact version → web/chat play → automatic fallback → visible game/art/idea credits.

The general builder is not connected to the studio. Seed Race has real separate-VM construction/tests and exact owner approval, but no deployed runtime. Keep it inert outside games/. Reuse that honest construction evidence rather than rebuilding an approved artifact or staging a live worker. Reconsider the demo only if the complete isolated build/runtime path is demonstrated by November 2, 09:00 UTC. Otherwise retain Plan B and name automation as the next step.

## Independent starting evidence

Clean HEAD 7fc4f88 passed **150 checks: 80 focused + 70 integration**. Post-audit commits already added subscription guest login, real Codex construction, separate tests, approval and cleanup. Thus the old “no isolated build” claim and test count were outdated; “no automatic worker” remained correct. Provider inventory listed only the two pre-existing Rust runtimes, not trial guests. No 8420 controller or tunnel was active.

Disposable probes reproduced host-constructor access and an infinite tick exceeding a one-second deadline. The initial Marble state was 19,287 bytes, about 1.052 GB/client-hour at 66 ms. Current code also confirmed public credit hashing, idle cloning/polling and feed-before-throttle. Saved Twitch rehearsals are actual network evidence using owner automation while offline; they are not human/OBS evidence. Seed Race's static preview is not live play.

## Implementation priorities and cuts

Exclude external Rust runtimes from configuration and recording pending rights/hosting review; choose local Marble as fallback. Describe only simulated build credits and disable paid-event accounting. Write privacy from actual data paths, leaving owner details visibly incomplete. Separate reviewed SDK execution from the controller, add watchdog/recovery, bound traffic, remove repeated credit hashing/polling and retain permanent contributor attribution. Node permissions alone are not malicious-code confinement.

Defer feed, marketplace, role-playing, clips, universal co-op, Kick pitch, effects pause and broad cleanup. Roadmap prose may describe creator discovery, credited clips and subscription-supported compute as future proposals.

## Owner risks and delivery

The repository identifies Devin CLI visual-graffiti as the prototype source; a targeted read-only metadata query independently confirmed its November 1 start. Preserve that provenance and disclose the separate read-only audit. No audit drafts or code are imported. Owner attests rights and completes privacy/contact/retention details, stable free judging access, human Twitch/browser rehearsal, OBS and an English video showing Codex work, public YouTube, private push/access for testing@devpost.com and Devpost submission.

Freeze: November 2, 13:00 UTC; afterward fix observed failures only. Human demo by 16:00; reserve 17:00–21:00 for recording/review; prudent submit 21:00; official close 22:00 UTC / 19:00 Santiago. No push, publication or new cloud spend is performed here.

[Completed work, commits and evidence](AUDIT_REPORT.md). Primary sources reopened independently: [official rules](https://twitchcon-codex.devpost.com/rules), [Node permissions](https://nodejs.org/api/permissions.html), [VM](https://nodejs.org/api/vm.html). The fetched [current Twitch agreement endpoint](https://legal.twitch.com/en/legal/developer-agreement/) returned no substantive contract body; archived wording was not represented as current verification.
