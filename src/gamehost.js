// SDK executor for a disposable game guest. Never use node:vm as a security boundary.
// The controller uses IsolatedGameHost; separate build/test VMs may use this executor.
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const timeout = 50;
export class GameHost {
  constructor({ gameDir, onEvent = () => {} }) {
    Object.assign(this, {
      gameDir,
      onEvent,
      game: null,
      state: null,
      error: null,
      _timer: null,
    });
  }
  async load() {
    try {
      return await this.loadSource(
        fs.readFileSync(path.join(this.gameDir, "game.js"), "utf8"),
      );
    } catch (error) {
      this.error = error.message;
      return false;
    }
  }
  async loadSource(source) {
    try {
      this.context = vm.createContext(Object.create(null), {
        name: "vibe-game",
        codeGeneration: { strings: false, wasm: false },
        microtaskMode: "afterEvaluate",
      });
      // Only realm-native values enter the guest. Host functions/constructors are not injected.
      vm.runInContext(
        "globalThis.console=Object.freeze({log(){},warn(){},error(){},info(){}})",
        this.context,
        { timeout },
      );
      const mod = new vm.SourceTextModule(source, {
        context: this.context,
        identifier: "game.js",
      });
      await mod.link(() => {
        throw Error("Game imports are disabled.");
      });
      await mod.evaluate({ timeout });
      this.context.__module = mod.namespace;
      const json = vm.runInContext(
        `JSON.stringify({meta:__module.meta||{},exports:Object.keys(__module).filter(k=>typeof __module[k]==='function')})`,
        this.context,
        { timeout },
      );
      if (json.length > 16384) throw Error("SDK metadata exceeds limit.");
      const descriptor = JSON.parse(json);
      for (const fn of ["createState", "tick", "view"])
        if (!descriptor.exports.includes(fn))
          throw Error("Missing SDK export " + fn);
      const raw = descriptor.meta;
      if (
        (raw.name !== undefined &&
          (typeof raw.name !== "string" || raw.name.length > 200)) ||
        (raw.description !== undefined &&
          (typeof raw.description !== "string" ||
            raw.description.length > 2000))
      )
        throw Error("Invalid game description.");
      const meta = {
        name: raw.name,
        description: raw.description,
        world: { w: raw.world?.w ?? 1280, h: raw.world?.h ?? 720 },
        tickRate: raw.tickRate ?? 30,
      };
      if (
        !Number.isFinite(meta.tickRate) ||
        meta.tickRate < 1 ||
        meta.tickRate > 60
      )
        throw Error("Invalid tick rate.");
      if (
        !Number.isFinite(meta.world?.w) ||
        !Number.isFinite(meta.world?.h) ||
        meta.world.w <= 0 ||
        meta.world.h <= 0 ||
        meta.world.w > 100000 ||
        meta.world.h > 100000
      )
        throw Error("Invalid world dimensions.");
      this.game = {
        name: meta.name || path.basename(this.gameDir || "game"),
        meta,
        fns: mod.namespace,
        exports: descriptor.exports,
        versionSha256: crypto.createHash("sha256").update(source).digest("hex"),
      };
      this.error = null;
      this.resetState();
      return !this.error;
    } catch (error) {
      this.error = "Game load failed: " + error.message;
      return false;
    }
  }
  resetState() {
    try {
      vm.runInContext(
        `if(globalThis.__state&&typeof __module.destroy==='function')__module.destroy(__state);globalThis.__state=__module.createState()||{};if(!__state.__players)__state.__players=new Map()`,
        this.context,
        { timeout },
      );
      this.state = this.context.__state;
    } catch (error) {
      this.fail("createState", error);
    }
  }
  fail(fn, error) {
    if (this.error) return;
    this.error = fn + ": " + error.message;
    clearInterval(this._timer);
    this.onEvent("game-error", this.error);
  }
  safeCall(fn, ...args) {
    if (!this.game?.exports.includes(fn) || this.error) return;
    try {
      // Parse arguments in the realm; no object supplied by a player retains a host prototype.
      const call = `__module[${JSON.stringify(fn)}](__state,...JSON.parse(${JSON.stringify(JSON.stringify(args))}))`;
      return vm.runInContext(call, this.context, { timeout });
    } catch (error) {
      this.fail(fn, error);
    }
  }
  getView() {
    const empty = {
      bg: "#111",
      world: this.game?.meta.world || { w: 1280, h: 720 },
      layers: [],
      hud: [],
    };
    if (!this.game || this.error) return empty;
    try {
      // Serialize under the same deadline, including getters/proxies/toJSON from the guest.
      const json = vm.runInContext(
        "JSON.stringify(__module.view(__state)||{})",
        this.context,
        { timeout },
      );
      if (json.length > 524288) throw Error("Frame exceeds 512 KiB.");
      const v = JSON.parse(json);
      return {
        ...empty,
        bg: v.bg || empty.bg,
        layers: Array.isArray(v.layers) ? v.layers : [],
        hud: Array.isArray(v.hud) ? v.hud : [],
      };
    } catch (error) {
      this.fail("view", error);
      return empty;
    }
  }
  start() {
    clearInterval(this._timer);
    let last = Date.now();
    this._timer = setInterval(
      () => {
        const now = Date.now();
        this.safeCall("tick", Math.min(0.25, (now - last) / 1000));
        last = now;
      },
      1000 / (this.game?.meta.tickRate || 30),
    );
  }
  startWatching() {
    this._watcher?.close();
    let debounce;
    this._watcher = fs.watch(this.gameDir, () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const ok = await this.load();
        this.onEvent(ok ? "game-reloaded" : "game-error", this.error);
      }, 150);
    });
    this._clearDebounce = () => clearTimeout(debounce);
  }
  stop() {
    clearInterval(this._timer);
    this._watcher?.close();
    this._clearDebounce?.();
  }
}
