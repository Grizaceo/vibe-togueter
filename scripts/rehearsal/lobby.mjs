import WebSocket from "ws";
export let socket, latest;

export async function rehearseLobby({
  base,
  navigate,
  wait,
  evaluate,
  check,
  command,
  capture,
}) {
  await navigate("/?name=BrowserRehearsal");
  // The lobby asks for a pairing code (or a web-guest name) before playing.
  await wait(() =>
    evaluate(
      "/^!join [0-9A-HJKMNP-TV-Z]{6}$/.test(document.getElementById('seat-code').textContent)",
    ),
  );
  check(
    "lobby shows a chat pairing code and a prefilled web-guest name",
    await evaluate(
      "!document.getElementById('seat-gate').hidden&&document.getElementById('seat-guest-name').value==='BrowserRehearsal'",
    ),
  );
  await evaluate("document.getElementById('seat-guest').requestSubmit()");
  await wait(() =>
    evaluate(
      "document.getElementById('me').textContent==='You are BrowserRehearsal · web guest'&&document.getElementById('seat-gate').hidden",
    ),
  );
  check("web guest takes an unverified seat and the gate closes", true);
  await wait(() =>
    evaluate(
      "document.querySelector('.creator-strip')?.textContent.includes('Kenney')",
    ),
  );
  check(
    "lobby shows game, art and idea credit while details are collapsed",
    await evaluate(
      "(()=>{const c=document.querySelector('.creator-strip');return c.textContent.includes('Game by:')&&c.textContent.includes('Art by:')&&c.textContent.includes('Idea by:')&&!document.querySelector('#live-credits details').open})()",
    ),
  );
  check(
    "creator strip is inside the desktop viewport",
    await evaluate(
      "(()=>{const r=document.querySelector('.creator-strip').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()",
    ),
  );
  socket = new WebSocket(
    base.replace(/^http/, "ws") + "/spectate?name=frame-observer",
  );
  socket.on("message", (raw) => {
    const msg = JSON.parse(raw);
    if (msg.t === "state") latest = msg;
  });
  await new Promise((r) => socket.once("open", r));
  await wait(() => latest);
  const before = latest.view.layers
    .filter((p) => p.t === "sprite" && p.src.endsWith("tree01.png"))
    .reduce((sum, p) => sum + p.h, 0);
  await command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
  });
  await command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
  });
  await wait(
    () =>
      latest.view.layers
        .filter((p) => p.t === "sprite" && p.src.endsWith("tree01.png"))
        .reduce((sum, p) => sum + p.h, 0) > before,
  );
  check("production browser keyboard handler plants a visible tree", true);
  await capture("local-ui-lobby");
}
