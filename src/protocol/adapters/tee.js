// Tee adapter: the teeworlds-rs remote runtime as a protocol v1 game.
// The platform drives the collective tee through declared chat commands;
// the bridge carries one bounded pulse per accepted command.
import { TEE_LOCAL_CONTRACT } from "../../tee-native-codec.js";
export const TEE_CONTRACT = TEE_LOCAL_CONTRACT;
export function teeManifest(entry) {
  return {
    protocol: "va-game/1",
    name: entry.title || "teeworlds-rs",
    description:
      "External game by Cristóbal Muñoz. Chat: !tee left|right|jump|hook|fire|stop.",
    seats: { player: 0, spectator: null, streamer: 0 },
    input: { keys: [], pointer: false },
    chat: {
      commands: ["left", "right", "jump", "hook", "fire", "stop"].map(
        (name) => ({
          name,
          args: [],
          who: "anyone",
          perActorMs: 250,
          globalPerSec: 10,
        }),
      ),
      bursts: [],
    },
    delivery: ["B"],
    rounds: false,
  };
}
export class TeeAdapter {
  // The manifest is platform-issued: the remote game never sends one.
  legacyManifest = false;
  static healthPath = "/healthz";
  static checkHealth(body) {
    return body?.data?.up === true;
  }
  static chatControl = true;
  constructor({ entry, bridge, channel, connect = null }) {
    Object.assign(this, { entry, bridge, channel, connect });
  }
  start({ onMessage, onExit }) {
    let connected = false,
      lastHealth = 0;
    this.bridge.onStop = (reason) => onExit({ reason });
    this.bridge.onSnapshot = (message) => {
      // Health beats arrive inside snapshots; one per second is enough for
      // the watchdog and keeps delivery B frames cheap.
      const at = Date.now();
      if (at - lastHealth < 1000) return;
      lastHealth = at;
      onMessage(
        JSON.stringify({
          t: "health",
          tick: this.bridge.state.snapshots,
          players: message.players?.length ?? 0,
        }),
      );
    };
    const link = {
      send: (message) => {
        switch (message?.t) {
          case "hello":
            (this.connect
              ? this.connect()
              : this.bridge.start(this.entry, this.channel)
            )
              .then(() => {
                connected = true;
                onMessage(
                  JSON.stringify({
                    t: "ready",
                    protocol: "va-game/1",
                    manifest: teeManifest(this.entry),
                    view: {},
                  }),
                );
              })
              .catch((error) =>
                onExit({ reason: error.message || "start failed" }),
              );
            return;
          case "effect":
            this.bridge.action(message.name);
            return;
          case "pause":
            this.bridge.pause(true);
            return;
          case "resume":
            this.bridge.pause(false);
            return;
          case "stop":
            this.bridge.stop("disabled");
            return;
          default:
            // join/input/chat can never arrive: the manifest has no seats and
            // no passthrough. Ignore defensively.
            return;
        }
      },
      stop: () => this.bridge.stop("disabled"),
    };
    return Promise.resolve(link);
  }
}
