# Judge host runbook — owner executes

Prepared for a Linux VM with a fixed HTTPS address and persistent disk. No host has been purchased, provisioned or published by this work. Keep judge access free through November 15; set a provider budget alert and a November 16 shutdown reminder before starting billing.

## 1. Select and prepare the VM

- Use **Debian 12**, or **Ubuntu 24.04** with the restricted bubblewrap AppArmor profile below. Start with 2 GiB RAM, then check actual CPU/memory and concurrent-client behavior before sharing the URL.
- Install Git, bubblewrap, CA certificates, Node and npm. Match the tested Node 26.12.1 installation at `/usr/bin/node`: the guest explicitly executes that path and needs `--permission` and `--experimental-vm-modules`. Do not assume the distribution's default Node has those features.
- Use an unprivileged `vibe-arena` service account and a persistent directory such as `/srv/vibe-arena`. The service account needs to write `runtime/`, its private `.env` and the operator-managed journals. Do not put the application on an ephemeral root disk or a tmpfs.
- Firewall public ingress to HTTPS/HTTP and restricted SSH. Port 8420 stays loopback only. Keep an existing SSH session open while applying firewall rules and confirm a second connection before closing it.
- Transfer the reviewed repository using the owner's authorized source-access method. Do not copy local `.env`, live journals, `node_modules` or unrelated game repositories from the PC.

On Ubuntu 24.04, inspect the [restricted AppArmor profile](https://github.com/dfaerch/bubblewrap-on-ubuntu/blob/main/profiles/24.04/bwrap-userns-restrict), save it as `bwrap-userns-restrict`, then install and load it:

```bash
sudo install -m 644 bwrap-userns-restrict /etc/apparmor.d/bwrap-userns-restrict
sudo apparmor_parser -r /etc/apparmor.d/bwrap-userns-restrict
```

Do not turn off AppArmor or the system-wide unprivileged-user-namespace protection to make a failing test pass. Re-run the project's isolation tests as the service user after installing the profile.

## 2. Install and configure privately

As the service account in `/srv/vibe-arena`:

```bash
/usr/bin/node --version
npm ci
npm test
npm run setup:local
```

The setup command creates missing secrets without printing them. Keep `.env` mode 600. Set `VA_PUBLIC_URL=https://YOUR_HOSTNAME` privately. For Twitch, configure the owner's application/callback and run the existing authorization flow; verify `npm run twitch:status` without recording credentials. Do not expose OAuth device instructions or admin/streamer keys in the video.

Confirm the deployed configuration before launch:

```bash
node --input-type=module -e 'import fs from "node:fs";import assert from "node:assert/strict";const c=JSON.parse(fs.readFileSync("vibe-arena.config.json"));assert.equal(c.build.execution,"cloud-vm");assert.equal(c.build.studioWorker.enabled,false);assert.equal(c.build.studioWorker.prewarmEnabled,false);assert.equal(c.build.studioWorker.approvalId,null);assert.equal(c.build.studioWorker.vmBudgetMinor,0);assert.deepEqual(c.remoteGames,[]);assert.equal(c.monetization.autoGenerate,false);assert.equal(c.monetization.simulateEventCredits,false);console.log("Public host gates OK");'
```

Leave `VA_SIMULATE_EVENT_CREDITS` unset. Worker, warm preparation and public Tee remain off. Never load a quarantined artifact as a local bundled game.

## 3. Keep the service and journals persistent

Example `/etc/systemd/system/vibe-arena.service`; replace `YOUR_CHANNEL` only after Twitch authentication is ready. For browser-only acceptance, omit `--twitch YOUR_CHANNEL` until then.

```ini
[Unit]
Description=Vibe Arena judge demo
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=vibe-arena
Group=vibe-arena
WorkingDirectory=/srv/vibe-arena
Environment=HOME=/srv/vibe-arena
UMask=0077
ExecStart=/usr/bin/node --experimental-vm-modules src/server.js --host 127.0.0.1 --port 8420 --twitch YOUR_CHANNEL --game-dir games/community-grove
Restart=on-failure
RestartSec=5
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
```

The app reads its private `.env` from the working directory. Keep `/srv/vibe-arena/runtime/` and any `ideas.jsonl`/`treasury.jsonl` on the persistent volume. Back up private records with access controls and an explicit retention period. Do not reset a controller lock or build journal to bypass reconciliation. Do not add systemd namespace restrictions that prevent the bubblewrap child from starting.

```bash
sudo systemd-analyze verify /etc/systemd/system/vibe-arena.service
sudo systemctl daemon-reload
sudo systemctl enable --now vibe-arena
sudo systemctl status vibe-arena
```

For persistent service logs, configure journald `Storage=persistent`, a suitable disk cap and retention, and verify logs survive reboot. Review logs locally; do not export private messages or secrets into public evidence.

## 4. Add HTTPS and WSS

Point the chosen hostname at the VM and install Caddy through its supported package instructions. Example Caddyfile, with a real hostname in place of `YOUR_HOSTNAME`:

```caddyfile
YOUR_HOSTNAME {
    @private path /admin /admin/*
    handle @private {
        respond "Private administration" 403
    }
    handle {
        reverse_proxy 127.0.0.1:8420
    }
}
```

Validate with `caddy validate --config /etc/caddy/Caddyfile`, then reload Caddy. Its [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) supports WebSocket upgrades. Preserve forwarded client headers; the app also rejects forwarded admin operations. The firewall and loopback bind prevent bypassing Caddy on port 8420.

For local owner controls, use an SSH forward (`ssh -N -L 18420:127.0.0.1:8420 YOUR_SSH_HOST`) and open `http://localhost:18420/studio.html` privately. The public proxy must continue rejecting admin even with valid keys.

## 5. Acceptance before giving judges the URL

Record commit, OS/Node/bubblewrap versions, UTC time and actual results in a private deployment receipt. This checklist alone is not deployment evidence.

- [ ] `npm ci` and `npm test` pass on the host as the service user. Run `node --experimental-vm-modules --test test/game-isolation.mjs` there to check constructor escape, hung callbacks and recovery. A startup failure is a failed gate, not a reason to bypass isolation.
- [ ] The real service renders Grove and its game/art/idea strip. Inspect the child with `ps` and `/proc` to confirm the expected bubblewrap process, separate network namespace and no owner home/configuration mounts. Do not print environment values.
- [ ] An authenticated real Twitch moderator sends `!fallback`; the visible fallback reason and the reviewed fallback game appear while browser clients remain connected. A web nickname is not sufficient. This is requested recovery, not a simulated crash claim.
- [ ] From a second device/network, `https://YOUR_HOSTNAME/`, `/studio.html`, `/overlay.html` and `/privacy.html` load. DevTools shows an active **WSS** connection delivering game frames; actually join and play. Repeat after an idle interval.
- [ ] From that external device, `curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_HOSTNAME/admin/status` prints **403**. Direct public access to port 8420 fails. Check both IPv4 and IPv6 if the hostname advertises both.
- [ ] Create a harmless round through private controls, note its ID, restart the service and confirm it persists. Reboot the VM and confirm that same round, publication/credit records and private journals survive. Session-only predictions/delegation may reset as documented.
- [ ] Recheck worker/preparation off, empty remote catalog and no coding-provider operation. No VM budget is consumed by the judge host's Studio.
- [ ] Edit the hosting/recording disclosure in `public/privacy.html` with the actual operator-selected provider, region, processing/recording details, retention and deletion/contact procedure. Update all UI hosting labels, README and SUBMISSION with the tested URL. No provider is guessed in advance.
- [ ] Test logged-out free access, note the required November 15 availability window and verify budget alert/shutdown reminder. Owner records, reviews, pushes and submits separately.

Sources reopened November 2: [Ubuntu bubblewrap profile project](https://github.com/dfaerch/bubblewrap-on-ubuntu), [Caddy proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). The service template and commands have not been run on a purchased judge VM; host acceptance remains necessary.
