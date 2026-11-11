// GameVmManager: the vault-side owner of the session's single game VM (VM3).
// Owns clean resets, fallback to the default image, the provider-pause cost
// fuse (never resume), session close with confirmed destruction and the
// filtered journal. Provider access is injected through `backend`; funnel
// access through `hooks`. Design: docs/platform/VM3_RUNTIME.md §3, §7.
import crypto from "node:crypto";
import { PHASES, journalEvent, readJsonFile, validateImageSpec, vmId, writeJsonAtomic } from "./runtime.js";

const MAX_EVENTS = 500;

export class GameVmManager {
  constructor({
    backend,
    room,
    images,
    file = null,
    hooks = {},
    attachTimeoutMs = 90000,
    statusPollMs = 5000,
    now = Date.now,
    onEvent = () => {},
  }) {
    if (!backend || typeof backend.create !== "function")
      throw Error("A VM3 backend is required.");
    if (typeof room !== "string" || !room || room.length > 128)
      throw Error("A room id is required.");
    if (!images?.default) throw Error("A default image spec is required.");
    for (const [key, spec] of Object.entries(images)) {
      validateImageSpec(spec);
      if (spec.key !== key) throw Error("Image spec key mismatch: " + key);
    }
    Object.assign(this, {
      backend, room, images, file, hooks, attachTimeoutMs, statusPollMs, now, onEvent,
    });
    this.phase = "closed";
    this.vm = null;          // backend handle of the current incarnation
    this.imageKey = null;    // image spec key the VM was created from
    this.incarnation = 0;    // increments on every create/reset
    this.gameKey = null;     // game currently loaded, if known
    this.gameHash = null;
    this.events = [];
    this.error = null;
    this._closing = false;
    this._poller = null;
    const prior = file ? readJsonFile(file) : null;
    if (prior) {
      // A controller restart never trusts a live VM: reconcile by destroying.
      if (prior.phase && PHASES.includes(prior.phase) && prior.phase !== "closed")
        this.phase = "cleanup-required";
      this.events = Array.isArray(prior.events) ? prior.events.slice(-MAX_EVENTS) : [];
      this.incarnation = Number.isSafeInteger(prior.incarnation) ? prior.incarnation : 0;
    }
  }

  // ---- journal ------------------------------------------------------------
  log(kind, fields = {}) {
    const event = journalEvent(kind, fields, this.now);
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.onEvent("vm3-" + kind, event);
    this._save();
    return event;
  }
  _save() {
    if (!this.file) return;
    writeJsonAtomic(this.file, {
      version: 1,
      room: this.room,
      backend: this.backend.name || "unknown",
      phase: this.phase,
      image: this.imageKey ? { key: this.imageKey, ref: this.images[this.imageKey].ref } : null,
      game: this.gameKey ? { key: this.gameKey, hash: this.gameHash } : null,
      vm: this.vm ? { id: vmId(this.vm.id) || "invalid", incarnation: this.incarnation } : null,
      incarnation: this.incarnation,
      events: this.events,
      error: this.error,
      updatedAt: this.now(),
    });
  }

  // ---- lifecycle ----------------------------------------------------------
  async open() {
    if (this.phase === "running" || this.phase === "attaching") return this.status();
    if (this.phase === "cleanup-required") {
      // A previous incarnation may still exist at the provider; destroy it
      // before anything new is created (never resume, never reuse).
      await this._destroyCurrent("restart-reconcile");
    }
    await this.activate("default", { reason: "open" });
    return this.status();
  }

  // Clean reset onto `imageKey` (default "default"): always destroy + create,
  // never restart-in-place. Resolves once the guest agent has attached.
  async activate(imageKey = "default", { reason = "load", game = null, payload = undefined } = {}) {
    const spec = this.images[imageKey];
    if (!spec) throw Error("Unknown image: " + imageKey);
    if (this._closing) throw Error("Session is closing.");
    const wasRunning = this.vm !== null;
    this.phase = wasRunning ? "resetting" : "provisioning";
    this._save();
    if (wasRunning) {
      this.log("reset", { from: this.imageKey, to: imageKey, incarnation: this.incarnation + 1 });
      await this._destroyCurrent("reset");
    }
    // Fresh per-incarnation credentials: a game token is minted for this VM
    // only, registered at the funnel before the VM can dial out.
    const token = crypto.randomBytes(24).toString("base64url");
    const agent = {
      ...spec.agent,
      room: this.room,
      token,
      imageKey,
    };
    if (typeof this.hooks.registerGameToken === "function")
      await this.hooks.registerGameToken({ room: this.room, token, ttlMs: this.attachTimeoutMs + 60000 });
    let vm;
    try {
      vm = await this.backend.create({
        name: "va-game-" + this.room.slice(0, 24) + "-" + (this.incarnation + 1),
        image: spec.ref,
        agent,
      });
    } catch (error) {
      if (typeof this.hooks.revokeGameToken === "function")
        await this.hooks.revokeGameToken({ room: this.room, token }).catch(() => {});
      this.phase = "cleanup-required";
      this.error = "provision failed";
      this._save();
      this.log("error", { reason: "provision failed: " + safeReason(error), phase: this.phase });
      throw error;
    }
    this.incarnation += 1;
    this.vm = vm;
    this.imageKey = imageKey;
    this.gameKey = game?.key ?? null;
    this.gameHash = game?.hash ?? null;
    this.phase = "attaching";
    this._save();
    this._startPolling();
    try {
      await this._waitAttach(token);
    } catch (error) {
      // No agent ever dialed out: destroy the VM, never leave it running.
      this.log("attach-timeout", { image: imageKey, timeoutMs: this.attachTimeoutMs });
      await this._destroyCurrent("attach-timeout");
      throw error;
    }
    this.phase = "running";
    this.error = null;
    this._save();
    this.log("game-loaded", {
      game: this.gameKey || imageKey,
      hash: this.gameHash || undefined,
      incarnation: this.incarnation,
    });
    return this.status();
  }

  async _waitAttach(token) {
    if (typeof this.hooks.waitAttach !== "function") return; // backends/tests may skip
    const wait = this.hooks.waitAttach({
      room: this.room,
      token,
      incarnation: this.incarnation,
      timeoutMs: this.attachTimeoutMs,
    });
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Error("agent attach timeout")),
        this.attachTimeoutMs,
      );
      timer.unref?.();
    });
    try {
      await Promise.race([wait, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  // Streamer button or watchdog: back to the default image and game.
  async fallback(reason = "fallback") {
    this.log("fallback", { reason, game: this.gameKey || undefined });
    try {
      await this.hooks.setWaiting?.({ phase: "resetting", reason: safeReason(reason) });
    } catch {}
    try {
      await this.activate("default", { reason: "fallback" });
    } finally {
      try {
        await this.hooks.setWaiting?.(null);
      } catch {}
    }
    return this.status();
  }

  // Session close (or cap expiry): stop game traffic, destroy the VM and
  // confirm the provider's terminal state. Idempotent.
  async close() {
    if (this.phase === "closed" && !this.vm) return this.status();
    this._closing = true;
    this._stopPolling();
    this.log("close", {});
    await this._destroyCurrent("session-close");
    this.phase = "closed";
    this._save();
    return this.status();
  }

  async _destroyCurrent(reason) {
    // Every destroy — reset, fallback, pause-fuse or close — stops the game
    // session first so its teardown never reads as a game failure.
    try {
      await this.hooks.beforeDestroy?.();
    } catch {}
    if (!this.vm) {
      this.phase = this._closing ? "closed" : this.phase;
      return;
    }
    const vm = this.vm;
    this.phase = "destroying";
    this._save();
    try {
      const result = await this.backend.destroy(vm);
      if (result?.confirmed !== true)
        throw Error("Provider did not confirm destruction.");
      this.log("destroyed", {
        terminalStatus: result.terminalStatus || "destroyed",
        incarnation: this.incarnation,
      });
      this.phase = "closed";
      this._save();
    } catch (error) {
      // Unconfirmed destruction is never silently retried into a new VM.
      this.phase = "cleanup-required";
      this.error = "destroy unconfirmed";
      this._save();
      this.log("error", { reason: "destroy unconfirmed", phase: this.phase });
      throw error;
    } finally {
      if (this.phase !== "cleanup-required") {
        this.vm = null;
        this.imageKey = null;
        this.gameKey = null;
        this.gameHash = null;
      }
    }
  }

  // Provider pause is a cost fuse only: observe and destroy, never resume.
  async checkProvider() {
    if (!this.vm || this.phase === "destroying" || this.phase === "closed") return this.status();
    let status;
    try {
      status = await this.backend.status(this.vm);
    } catch {
      return this.status(); // a lost observation never mutates the VM
    }
    if (status === "paused") {
      this.log("pause-observed", { vm: this.vm.id });
      this.phase = "cleanup-required";
      this._save();
      await this._destroyCurrent("provider-pause");
      this.phase = "closed";
      this._save();
      this.onEvent("vm3-pause-destroyed", { room: this.room });
    }
    return this.status();
  }

  _startPolling() {
    this._stopPolling();
    if (!this.statusPollMs || this.statusPollMs <= 0) return;
    this._poller = setInterval(() => {
      this.checkProvider().catch(() => {});
    }, this.statusPollMs);
    this._poller.unref?.();
  }
  _stopPolling() {
    if (this._poller) clearInterval(this._poller);
    this._poller = null;
  }

  status() {
    return {
      room: this.room,
      backend: this.backend.name || "unknown",
      phase: this.phase,
      image: this.imageKey,
      game: this.gameKey,
      vm: this.vm ? { id: this.vm.id, incarnation: this.incarnation } : null,
      incarnation: this.incarnation,
      error: this.error,
    };
  }
}

function safeReason(error) {
  return String(error?.message || error || "unknown").slice(0, 160);
}
