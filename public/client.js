// Shared client: connects over WS, forwards inputs, renders states.
import { drawFrame } from "./render.js";

// Links shared in chat carry no name (anyone may click them), so the entry
// page asks each viewer. An explicit ?name= is still honoured for own links.
export function askName({ doc = document, storage = globalThis.localStorage } = {}) {
  const fromLink = new URLSearchParams(location.search).get("name")?.trim();
  if (fromLink) return Promise.resolve(fromLink.slice(0, 20));
  let stored = "";
  try {
    stored = storage?.getItem("va-name") || "";
  } catch {}
  return new Promise((resolve) => {
    const form = doc.createElement("form");
    form.id = "name-gate";
    const label = doc.createElement("label");
    label.textContent = "Your name in this game";
    const input = doc.createElement("input");
    Object.assign(input, {
      name: "name",
      maxLength: 20,
      required: true,
      autocomplete: "nickname",
      value: stored.slice(0, 20),
    });
    const button = doc.createElement("button");
    button.textContent = "Play";
    label.append(input);
    form.append(label, button);
    form.onsubmit = (event) => {
      event.preventDefault();
      const name = input.value.trim().slice(0, 20);
      if (!name) return;
      try {
        storage?.setItem("va-name", name);
      } catch {}
      form.remove();
      resolve(name);
    };
    doc.body.append(form);
    input.focus();
  });
}

export function connect({
  name: chosenName,
  spectator = false,
  canvas,
  onWelcome,
  onFeed,
  onPlayers,
  onRole,
  onCredits,
  onActivity,
} = {}) {
  const params = new URLSearchParams(location.search);
  const name =
    chosenName ||
    params.get("name") ||
    localStorage.getItem("va-name") ||
    `anon-${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem("va-name", name);

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const path = spectator ? "/spectate" : "/play";
  const ws = new WebSocket(
    `${proto}://${location.host}${path}?name=${encodeURIComponent(name)}`,
  );
  const ctx = canvas?.getContext("2d");
  let world = { w: 1280, h: 720 };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === "welcome") {
      world = msg.world;
      onWelcome?.(msg);
    }
    if (msg.t === "state") {
      onActivity?.(msg.activity);
      onPlayers?.(
        msg.players,
        msg.game,
        msg.error ||
          (msg.fallback?.active ? "Fallback: " + msg.fallback.reason : ""),
        msg.fund,
      );
      if (ctx && canvas) {
        if (canvas.width !== canvas.clientWidth) {
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;
        }
        drawFrame(ctx, msg.view, canvas, msg.view.world || world);
      }
    }
    if (msg.t === "credits") onCredits?.(msg.publication);
    if (msg.t === "role") onRole?.(msg);
    if (msg.t === "feed") onFeed?.(msg);
  };

  // --- inputs ---
  if (!spectator && canvas) {
    const send = (data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: "input", data }));
    };
    const KEYS = new Set([
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      " ",
      "w",
      "a",
      "s",
      "d",
      "W",
      "A",
      "S",
      "D",
    ]);
    addEventListener("keydown", (e) => {
      if (
        !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
          e.target?.tagName,
        ) &&
        KEYS.has(e.key)
      ) {
        e.preventDefault();
        send({ kind: "key", key: norm(e.key), down: true });
      }
    });
    addEventListener("keyup", (e) => {
      if (KEYS.has(e.key)) send({ kind: "key", key: norm(e.key), down: false });
    });
    let activePointer = null;
    const releasePointer = (e) => {
      if (
        activePointer === null ||
        (e?.pointerId !== undefined && e.pointerId !== activePointer)
      )
        return;
      activePointer = null;
      send({
        kind: "pointer",
        ...(e ? toWorld(e, canvas, world) : { x: 0, y: 0 }),
        down: false,
      });
    };
    addEventListener("blur", () => {
      for (const key of [
        "up",
        "down",
        "left",
        "right",
        "w",
        "a",
        "s",
        "d",
        "space",
      ])
        send({ kind: "key", key, down: false });
      releasePointer();
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (activePointer !== null) return;
      activePointer = e.pointerId ?? 0;
      try {
        canvas.setPointerCapture?.(e.pointerId);
      } catch {}
      send({ kind: "pointer", ...toWorld(e, canvas, world), down: true });
    });
    canvas.addEventListener("pointermove", (e) => {
      if (activePointer === (e.pointerId ?? 0) && e.buttons)
        send({ kind: "pointer", ...toWorld(e, canvas, world), down: true });
    });
    addEventListener("pointerup", releasePointer);
    addEventListener("pointercancel", releasePointer);
    canvas.addEventListener("lostpointercapture", releasePointer);
  }

  function norm(k) {
    return (
      {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        " ": "space",
      }[k] || k.toLowerCase()
    );
  }
  function toWorld(e, canvas, world) {
    const r = canvas.getBoundingClientRect();
    const s = Math.min(r.width / world.w, r.height / world.h);
    return {
      x: (e.clientX - r.left - (r.width - world.w * s) / 2) / s,
      y: (e.clientY - r.top - (r.height - world.h * s) / 2) / s,
    };
  }

  return {
    sendChat: (text) =>
      ws.readyState === 1 && ws.send(JSON.stringify({ t: "chat", text })),
    claimStreamer: (key) =>
      ws.readyState === 1 &&
      ws.send(JSON.stringify({ t: "claim-streamer", key })),
    name,
  };
}
