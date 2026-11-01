// GameHost: loads a vibe-coded game.js into a vm sandbox and runs the tick loop.
// SDK contract (what the agent generates against):
//   export const meta = { name, description, world: {w,h}, tickRate }
//   export function createState() -> state
//   export function onJoin(state, player)          player: {id,name}
//   export function onLeave(state, player)
//   export function onInput(state, playerId, input) input: {kind:'key',key,down} | {kind:'pointer',x,y,down}
//   export function onChat(state, user, cmd, args)  passive mode; return truthy if handled
//   export function tick(state, dt)                dt in seconds
//   export function view(state) -> { bg, layers:[primitives], hud:[primitives] }
//     primitives: {t:'rect'|'circle'|'text'|'line'|'sprite', ...}
// Optional:
//   export function destroy(state)
//
// NOTE: node:vm is an accident barrier, not a hard security boundary.
// For real streams run the whole server inside docker (see docker-compose).

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SAFE_MATH = Object.freeze(Object.create(null, Object.getOwnPropertyDescriptors(Math)));

function makeSandbox(consoleProxy) {
  return vm.createContext(Object.freeze({
    Math: SAFE_MATH,
    JSON, Object, Array, Map, Set, WeakMap, WeakSet, Number, String, Boolean,
    Date, RegExp, Error, TypeError, RangeError, Symbol, Promise, Intl,
    Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
    Float32Array, Float64Array, ArrayBuffer, DataView, structuredClone,
    isNaN, isFinite, parseInt, parseFloat, NaN, Infinity, undefined,
    console: consoleProxy,
  }), { name: 'vibe-game' });
}

export class GameHost {
  constructor({ gameDir, onEvent }) {
    this.gameDir = gameDir;
    this.onEvent = onEvent || (() => {});
    this.game = null;      // { meta, fns, name }
    this.state = null;
    this.error = null;
    this._acc = 0;
    this._last = 0;
    this._timer = null;
    this._watchTimer = null;
  }

  async load() {
    const file = path.join(this.gameDir, 'game.js');
    let src;
    try {
      src = fs.readFileSync(file, 'utf8');
    } catch (e) {
      this.error = `cannot read ${file}: ${e.message}`;
      return false;
    }
    const logs = [];
    const consoleProxy = new Proxy({}, {
      get: (_, m) => (...a) => logs.push(`[game] ${m}: ${a.map(String).join(' ')}`),
    });
    const sandbox = makeSandbox(consoleProxy);
    let mod;
    try {
      const compiled = new vm.SourceTextModule(src, {
        identifier: file,
        context: sandbox,
      });
      await compiled.link(() => { throw new Error('imports are not allowed inside game.js'); });
      await compiled.evaluate();
      mod = compiled.namespace;
    } catch (e) {
      this.error = `game.js failed to compile: ${e.message}`;
      logs.forEach(l => this.onEvent('log', l));
      return false;
    }
    const required = ['createState', 'tick', 'view'];
    const missing = required.filter(k => typeof mod[k] !== 'function');
    if (missing.length) {
      this.error = `game.js missing exports: ${missing.join(', ')}`;
      return false;
    }
    this.game = {
      versionSha256:crypto.createHash('sha256').update(src).digest('hex'),
      name: mod.meta?.name || path.basename(this.gameDir),
      meta: { world: { w: 1280, h: 720 }, tickRate: 30, ...(mod.meta || {}) },
      fns: mod,
    };
    this.resetState();
    this.error = null;
    logs.forEach(l => this.onEvent('log', l));
    return true;
  }

  resetState() {
    if (this.state && this.game?.fns.destroy) {
      try { this.game.fns.destroy(this.state); } catch {}
    }
    try {
      this.state = this.game.fns.createState() || {};
    } catch (e) {
      this.state = {};
      this.error = `createState threw: ${e.message}`;
    }
    if (!this.state.__players) this.state.__players = new Map();
  }

  start() {
    const rate = this.game?.meta.tickRate || 30;
    const step = 1000 / rate;
    this._last = Date.now();
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      const now = Date.now();
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.25) dt = step / 1000; // clamp after hiccups
      if (!this.game) return;
      try {
        this.game.fns.tick(this.state, dt);
      } catch (e) {
        this.error = `tick threw: ${e.message}`;
        this.onEvent('log', `[game] tick error: ${e.stack || e}`);
      }
    }, step);
  }

  startWatching() {
    let debounce = null;
    this._watcher = fs.watch(this.gameDir, () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const ok = await this.load();
        this.onEvent(ok ? 'game-reloaded' : 'game-error', this.error);
      }, 150);
    });
  }

  stop() {
    clearInterval(this._timer);
    this._watcher?.close();
  }

  safeCall(fn, ...args) {
    if (!this.game || typeof this.game.fns[fn] !== 'function') return undefined;
    try { return this.game.fns[fn](this.state, ...args); }
    catch (e) {
      this.error = `${fn} threw: ${e.message}`;
      this.onEvent('log', `[game] ${fn} error: ${e.stack || e}`);
      return undefined;
    }
  }

  getView() {
    if (!this.game) return { bg: '#111', layers: [], hud: [{ t: 'text', x: 640, y: 360, text: 'no game loaded', size: 32, color: '#888' }] };
    const v = this.safeCall('view') || {};
    return {
      bg: v.bg || '#111',
      world: this.game.meta.world,
      layers: Array.isArray(v.layers) ? v.layers : [],
      hud: Array.isArray(v.hud) ? v.hud : [],
    };
  }
}
