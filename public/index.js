import { connect } from "./client.js";
import { attachLiveCredits } from "./live-credits.js";
const credits = attachLiveCredits(document.getElementById("live-credits"));
const $ = (id) => document.getElementById(id);
// A seat comes from a code typed in Twitch/Kick chat (or a web-guest
// name). The link posted in chat is the same for everyone.
let code = "",
  expiresAt = 0,
  ttlTimer = 0;
const showCode = () => {
  const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  $("seat-code").textContent = code ? `!join ${code}` : "…";
  $("seat-ttl").textContent = code
    ? left > 0
      ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}.`
      : "Expired: ask for a new code."
    : "";
  if (code && left <= 0) clearInterval(ttlTimer);
};
const REASONS = {
  replaced: "This seat was opened in another tab.",
  revoked: "The streamer removed this seat.",
  unseated: "Seat released. Pair again with a new code.",
};
try {
  $("seat-guest-name").value = (
    new URLSearchParams(location.search).get("name") ||
    localStorage.getItem("va-name") ||
    ""
  ).slice(0, 20);
} catch {}
const c = connect({
  seat: true,
  onSeat: ({ identity, reason }) => {
    if (identity) {
      $("seat-gate").hidden = true;
      $("not-me").hidden = false;
      $("me").textContent = `You are ${identity.name} · ${identity.verified ? identity.platform : "web guest"}`;
      clearInterval(ttlTimer);
      return;
    }
    $("not-me").hidden = true;
    $("me").textContent = "";
    $("seat-gate").hidden = false;
    $("seat-error").textContent = REASONS[reason] || "";
    c.seat.requestCode();
  },
  onCode: (m) => {
    code = m.code;
    expiresAt = Date.now() + m.ttlMs;
    $("seat-error").textContent = "";
    clearInterval(ttlTimer);
    ttlTimer = setInterval(showCode, 1000);
    showCode();
  },
  onSeatError: (reason) => ($("seat-error").textContent = reason),
  canvas: document.getElementById("cv"),
  onCredits: (publication) => credits.update(publication),
  onRole: (m) => {
    document.getElementById("role-status").textContent = m.ok
      ? "Controls unlocked"
      : "Key rejected / already claimed";
    document.getElementById("streamer-key").value = "";
  },
  onWelcome: (m) => {
    if (m.name) $("me").textContent = `You are ${m.name}`;
  },
  onPlayers: (p, game, err) => {
    credits.matchGame(game);
    if (game) {
      document.getElementById("game").textContent = game.name;
      document.getElementById("rules").textContent = game.desc || "";
    }
    document.getElementById("players").textContent = `${p.length} playing`;
    document.getElementById("err").textContent = err || "";
  },
});
$("seat-new").onclick = () => c.seat.requestCode();
$("seat-copy").onclick = () =>
  code && navigator.clipboard?.writeText(`!join ${code}`).catch(() => {});
$("seat-guest").onsubmit = (e) => {
  e.preventDefault();
  const name = $("seat-guest-name").value.trim().slice(0, 20);
  if (!name) return;
  try {
    localStorage.setItem("va-name", name);
  } catch {}
  c.seat.guest(name);
};
$("not-me").onclick = () => c.seat.notMe();
document.getElementById("streamer").onsubmit = (e) => {
  e.preventDefault();
  c.claimStreamer(document.getElementById("streamer-key").value);
};
document.getElementById("chat").onsubmit = (e) => {
  e.preventDefault();
  const i = document.getElementById("ct");
  if (i.value.trim()) c.sendChat(i.value.trim());
  i.value = "";
};
