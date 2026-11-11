// Funnel play page: seat flow + mode-A frame rendering against the funnel.
// Reuses the shared client modules served by the funnel itself.
import { createSeatClient, tabKey } from "/seat.js";
import { createFrameDecoder } from "/frame-codec.js";
import { createInterpolator } from "/interpolate.js";
import { drawFrame } from "/render.js";

const params = new URLSearchParams(location.search);
const room = params.get("room") || "";
const seatToken = params.get("seat") || "";
const frames = params.get("frames") || "d1";
const proto = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&frames=${frames}`);

const $ = (id) => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d");
const decoder = createFrameDecoder();
const interp = createInterpolator();
let view = null, world = null;

const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const feed = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  $("feed").prepend(div);
  while ($("feed").children.length > 40) $("feed").lastChild.remove();
};

const keyPromise = tabKey({ storage: localStorage });
const seat = createSeatClient({
  send,
  keyPromise,
  storage: localStorage,
  onSeat: ({ identity, reason }) => {
    $("who").textContent = identity ? `playing as ${identity.name}` : `waiting for a seat (${reason || "new"})`;
    $("unseat").classList.toggle("hidden", !identity);
    $("fallback").classList.toggle("hidden", !identity || identity.platform !== "web");
  },
  onCode: ({ code }) => { $("paircode").textContent = code; feed(`pair code: ${code}`); },
  onError: (reason) => feed("seat error: " + reason),
});

function paint() {
  requestAnimationFrame(paint);
  if (!view) return;
  const sampled = interp.sample(performance.now()) || view;
  drawFrame(ctx, { ...sampled, world: world || sampled.world }, cv, world);
}
requestAnimationFrame(paint);

ws.onmessage = async (event) => {
  let msg;
  try { msg = JSON.parse(event.data); } catch { return; }
  // Frame plane first: k/d frames decode to state views.
  if (msg.t === "k" || msg.t === "d" || (typeof event.data === "string" && msg.t === "state")) {
    const state = decoder.decode(typeof event.data === "string" ? event.data : event.data);
    if (state.t === "resync") { ws.send(JSON.stringify({ t: "resync" })); return; }
    view = state.view;
    world = state.view?.world || world;
    interp.push(view, performance.now());
    return;
  }
  if (await seat.handle(msg)) return;
  switch (msg.t) {
    case "waiting":
      $("waiting").classList.toggle("hidden", !msg.state);
      if (msg.state) $("waiting").textContent = msg.state.reason || "Game resetting — back in a moment…";
      break;
    case "game":
      if (msg.info?.name) document.title = msg.info.name + " — Vibe Arena";
      break;
    case "feed":
      feed(msg.text || msg.kind || "feed");
      break;
    case "pong": break;
    default: break;
  }
};
ws.onclose = () => { $("who").textContent = "disconnected — reload to rejoin"; };
ws.onopen = () => {
  if (seatToken) send({ t: "hello", seat: seatToken });
};

$("guest").onclick = () => seat.guest($("guestname").value.trim());
$("pair").onclick = () => seat.requestCode();
$("unseat").onclick = () => send({ t: "unseat" });
$("fallback").onclick = () => send({ t: "chat", text: "!fallback" });
