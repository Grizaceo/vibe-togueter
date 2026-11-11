// Vm3Link: the va-game/1 adapter that runs over the funnel channel. The game
// worker lives inside VM3; this link only sees the relayed JSON lines. Game
// payloads (phase-4 SDK source, phase-6 artifact bundles) are pushed to the
// guest agent as a `load` control message before the protocol hello.
export class Vm3Link {
  legacyManifest = true; // VM3 SDK games derive manifests like SdkAdapter
  constructor({ channel, room, payload = null, attachTimeoutMs = 90000 }) {
    if (!channel || !room) throw Error("Vm3Link needs channel and room.");
    Object.assign(this, { channel, room, payload, attachTimeoutMs });
    this._off = [];
  }
  async start({ onMessage, onExit, onLiveness }) {
    // Wait until this incarnation's agent is attached at the funnel. The
    // manager guarantees ordering; the link still waits so a late hello can
    // never race the attach. (The funnel buffers to-game messages anyway.)
    if (!this.channel.isAttached?.(this.room))
      await this.channel.waitFor("game-attached", {
        predicate: (m) => m.room === this.room,
        timeoutMs: this.attachTimeoutMs,
      });
    if (this.payload?.kind === "sdk-source")
      this.channel.send({ t: "to-game", msg: { t: "load", source: this.payload.source } });
    const offMessage = this.channel.on("from-game", (m) => {
      if (m.room === this.room && typeof m.line === "string") onMessage(m.line);
    });
    const offLive = this.channel.on("game-liveness", (m) => {
      if (m.room === this.room) onLiveness?.();
    });
    const offDetach = this.channel.on("game-detached", (m) => {
      if (m.room === this.room) onExit({ reason: "game-detached: " + (m.reason || "closed") });
    });
    const offClosed = this.channel.on("closed", () => {
      onExit({ reason: "funnel channel closed" });
    });
    this._off = [offMessage, offLive, offDetach, offClosed];
    return {
      send: (message) => this.channel.send({ t: "to-game", msg: message }),
      stop: () => {
        this.channel.send({ t: "to-game", msg: { t: "stop" } });
        for (const off of this._off.splice(0)) off?.();
      },
    };
  }
}
