# VM3 rehearsal runbook

Stage 3b: prove the whole path end to end — signed Kick webhooks → public
funnel → vault → `va-game/1` → VM3 (CreateOS) → teeworlds-rs — with a local
controller, a deployed funnel and a test Kick key. Nothing here touches real
Kick or Twitch; every webhook is signed locally.

Prereqs: Docker, `createos` CLI authenticated, `gh` access to the private
teeworlds-rs repo, Node ≥ 22 locally (the guest agent needs the global
`WebSocket`).

## 1. Build the tee bundle

```bash
node scripts/vm3/build-tee-bundle.mjs \
  --repo /home/gris96/.cache/va-tee-check/repo --rev 9fca1ed
```

Writes `runtime/vm3/tee-bundle.tar` (gitignored) and
`runtime/vm3/tee-bundle.json` (`{rev, sha256, bytes, builtAt}`). The server
start checks the tar's sha256 against the sidecar before creating any VM.

## 2. Bring the funnel up

```bash
node scripts/vm3/funnel-createos.mjs up --kick-test-key
```

Creates a CreateOS sandbox (`devbox:1`, ingress on, auto-pause 3 h), pushes
the funnel sources, generates the vault secret and an RSA-2048 test keypair,
and starts `src/funnel/main.js` inside. Journals everything in
`runtime/vm3/funnel.json` (0600) plus the private key at
`runtime/vm3/kick-test-key.pem` (0600). Prints the public URL.

- `node scripts/vm3/funnel-createos.mjs status` — phase/id/url, never secrets.
- `node scripts/vm3/funnel-createos.mjs down` — destroys and confirms.

If the sandbox's node is older than 22 the script destroys it and fails;
devbox:1 currently satisfies this (verify once in 3b and record it in the
evidence).

## 3. Start the controller

```bash
VA_VM3=1 npm start -- --port 8420
```

With `VA_VM3=1` (or `"vm3": {"enabled": true}` in
`vibe-arena.config.json`) the controller reads `runtime/vm3/funnel.json`,
verifies the bundle hash, builds the CreateOS backend restricted to the
funnel host, and opens the VM3 host in the background — HTTP listen is never
blocked. No Twitch or Kick credentials are needed; chat arrives only through
signed webhooks.

## 4. Rehearse

```bash
node scripts/rehearse-kick-vm3.mjs --controller http://127.0.0.1:8420
```

The script waits for `teeBridge.connected` + `vm3.phase === "running"`,
sends signed `chat.message.sent` events (`!tee right` ×6 across two sender
ids, then `!tee jump`), checks command counts and tee position, verifies
redelivery dedupe and bad-signature rejection, triggers `!fallback` from a
moderator-badged sender, waits for the new incarnation and repeats a jump.
Evidence lands in `docs/evidence/kick-vm3-<ts>.json`; exit code is non-zero
on any failed check.

## 5. Tear down

- `Ctrl-C` the controller: shutdown destroys the game VM and waits (bounded
  at 90 s) for provider-confirmed destruction before exiting.
- `node scripts/vm3/funnel-createos.mjs down` — destroys the funnel sandbox.
- `createos sb ls` should show nothing of ours (`va-funnel-*` names).
