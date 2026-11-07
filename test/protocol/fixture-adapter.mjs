// Scripted in-process game speaking protocol v1 for the conformance suite.
export function makeFixture(scenario = {}) {
  const received = [];
  let onMessage, onExit, timer, timer2, stopped = false;
  const say = (o) => onMessage?.(typeof o === "string" ? o : JSON.stringify(o));
  const base = {
    protocol: "va-game/1",
    id: "fixture",
    name: "fixture",
    world: { w: 1280, h: 720 },
    tickRate: 30,
    input: { keys: ["left", "right", "w", "a", "s", "d", "up", "down", "space"], pointer: true, actions: [{ name: "aim", fields: { x: [-1, 1], y: [-1, 1] } }] },
    chat: { commands: [{ name: "plant", args: [{ int: [1, 6] }, { enum: ["oak", "pine"] }, { text: 40 }], who: "anyone", perActorMs: 150, globalPerSec: 1 }, { name: "admin", args: [], who: "broadcaster", perActorMs: 100 }], bursts: [] },
    delivery: ["A"],
    rounds: scenario.rounds === true,
    resources: [],
  };
  const ready = () => {
    say({
      t: "ready",
      protocol: scenario.protocol ?? "va-game/1",
      manifest: scenario.manifest === null ? null : (scenario.manifest ?? base),
      view: { bg: "#111", world: { w: 1280, h: 720 }, layers: [], hud: [] },
      ...(scenario.sdkMeta ? { sdk: { meta: scenario.sdkMeta } } : {}),
    });
    // The platform may already have refused this ready and stopped the link.
    if (stopped) return;
    const b = scenario.behavior ?? "frames";
    if (b === "frames") timer = setInterval(() => say({ t: "frame", view: { layers: [], hud: [] } }), scenario.interval ?? 20);
    else if (b === "health") timer = setInterval(() => say({ t: "health", tick: 0, players: 0 }), scenario.interval ?? 20);
    else if (b === "silent") {}
    else if (b === "malformed") timer = setTimeout(() => say("{not json"), 30);
    else if (b === "oversized") timer = setTimeout(() => say({ t: "frame", view: { hud: "x".repeat(700000) } }), 30);
    else if (b === "unknown") timer = setTimeout(() => say({ t: "bogus" }), 30);
    else if (b === "failure") timer = setTimeout(() => say({ t: "failure", code: "boom", message: scenario.failureMessage ?? "gave up" }), 30);
    else if (b === "round") timer = setTimeout(() => say({ t: "round", phase: "end", results: scenario.results ?? [] }), 30);
    else if (b === "second-ready") timer = setTimeout(() => say({ t: "ready", protocol: "va-game/1", manifest: base, view: {} }), 30);
    if (scenario.exitAfter !== undefined)
      timer2 = setTimeout(() => onExit?.({ reason: "fixture exit" }), scenario.exitAfter);
  };
  const adapter = {
    legacyManifest: scenario.legacy === true,
    start(hooks) {
      onMessage = hooks.onMessage;
      onExit = hooks.onExit;
      return Promise.resolve({
        send(msg) {
          received.push(msg);
          if (msg.t === "hello" && scenario.neverReady !== true)
            timer = setTimeout(ready, scenario.delay ?? 0);
        },
        stop() {
          stopped = true;
          clearTimeout(timer);
          clearTimeout(timer2);
          clearInterval(timer);
        },
      });
    },
  };
  return { adapter, received: () => received };
}
