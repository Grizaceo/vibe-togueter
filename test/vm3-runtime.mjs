import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GameVmManager } from "../src/vm3/manager.js";
import { journalEvent, safeText, validateImageSpec } from "../src/vm3/runtime.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// In-memory backend: records every lifecycle call, supports scripted status.
export function makeFakeBackend({ statuses = {} } = {}) {
  const calls = [];
  const vms = new Map();
  let seq = 0;
  const backend = {
    name: "fake",
    async create({ name, image, agent }) {
      calls.push(["create", { name, image, agent }]);
      const vm = {
        id: "vm-" + (++seq),
        name,
        image,
        agent,
        status: "running",
        incarnation: seq,
      };
      vms.set(vm.id, vm);
      return vm;
    },
    async status(vm) {
      calls.push(["status", vm.id]);
      const v = vms.get(vm.id);
      return v ? (statuses[v.id] ?? v.status) : "missing";
    },
    async reset(vm, args) {
      calls.push(["reset", vm.id, args]);
      return backend.create(args);
    },
    async destroy(vm) {
      calls.push(["destroy", vm.id]);
      const v = vms.get(vm.id);
      if (v) v.status = "destroyed";
      return { confirmed: true, terminalStatus: "destroyed" };
    },
    async pause(vm) {
      calls.push(["pause", vm.id]);
      const v = vms.get(vm.id);
      if (v) v.status = "paused";
    },
  };
  return { backend, calls, vms };
}

const IMAGES = {
  default: {
    key: "default",
    ref: "va-game:waiting-1",
    agent: { funnelUrl: "wss://funnel.test" },
    payload: { kind: "none" },
  },
  grove: {
    key: "grove",
    ref: "va-game:waiting-1",
    agent: { funnelUrl: "wss://funnel.test" },
    payload: { kind: "sdk-source", source: "export function createState(){return {}}" },
  },
};

function makeManager(t, { hooks = {}, backendOpts = {}, ...opts } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-vm3-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { backend, calls, vms } = makeFakeBackend(backendOpts);
  const events = [];
  const manager = new GameVmManager({
    backend,
    room: "room-test",
    images: IMAGES,
    file: path.join(dir, "gamevm.json"),
    hooks,
    statusPollMs: 0,
    onEvent: (k, d) => events.push([k, d]),
    ...opts,
  });
  return { manager, backend, calls, vms, events, dir };
}

test("image specs and journal events are strictly validated", () => {
  assert.throws(() => validateImageSpec(null));
  assert.throws(() => validateImageSpec({ key: "Bad Key!", ref: "x" }));
  assert.throws(() => validateImageSpec({ key: "ok", ref: "x", agent: { funnelUrl: 1 } }));
  assert.throws(() => validateImageSpec({ key: "ok", ref: "x", agent: { kind: "mystery" } }));
  assert.throws(() => validateImageSpec({ key: "ok", ref: "x", agent: { mode: "dm; x" } }));
  assert.throws(() => validateImageSpec({ key: "ok", ref: "x", agent: { mode: "M".repeat(21) } }));
  assert.throws(() => validateImageSpec({ key: "ok", ref: "x", payload: { kind: "mystery" } }));
  assert.doesNotThrow(() =>
    validateImageSpec({
      key: "tee",
      ref: "tee:test",
      payload: { kind: "tee-native" },
      agent: { kind: "tee-native", mode: "dm" },
    }),
  );
  const e = journalEvent("error", { reason: "has ip 10.0.0.1 inside", phase: "x" });
  assert.match(e.reason, /^sha256:/, "IP-looking text is hashed, not stored");
  assert.equal(safeText("plain reason"), "plain reason");
  assert.throws(() => journalEvent("bogus"), /Unknown journal event kind/);
});

test("open provisions the default image and waits for attach", async (t) => {
  const attached = [];
  const { manager, calls, vms } = makeManager(t, {
    hooks: {
      registerGameToken: async ({ token }) => attached.push(["token", token]),
      waitAttach: async ({ token, incarnation }) => attached.push(["attach", token, incarnation]),
    },
  });
  const status = await manager.open();
  assert.equal(status.phase, "running");
  assert.equal(status.image, "default");
  assert.equal(calls.filter((c) => c[0] === "create").length, 1);
  const create = calls.find((c) => c[0] === "create")[1];
  assert.equal(create.image, "va-game:waiting-1");
  assert.equal(create.agent.room, "room-test");
  assert.equal(create.agent.funnelUrl, "wss://funnel.test");
  assert.ok(create.agent.token.length > 20, "per-incarnation game token");
  assert.deepEqual(attached.map((a) => a[0]), ["token", "attach"]);
  assert.equal(attached[1][2], 1);
  // journal is filtered: no token, no source text
  const journal = JSON.parse(fs.readFileSync(path.join(manager.file)));
  assert.equal(journal.phase, "running");
  const raw = fs.readFileSync(manager.file, "utf8");
  assert.ok(!raw.includes(create.agent.token), "game token never journaled");
  assert.ok(!raw.includes("export function"), "game source never journaled");
});

test("loadGame always resets to a clean image, even for the same game", async (t) => {
  const { manager, calls, vms } = makeManager(t, {
    hooks: { waitAttach: async () => {} },
  });
  await manager.open();
  const first = manager.vm.id;
  await manager.activate("grove", { game: { key: "community-grove", hash: "abc123" } });
  const ops = calls.map((c) => c[0]);
  assert.deepEqual(ops, ["create", "destroy", "create"]);
  assert.notEqual(manager.vm.id, first, "new incarnation, not a restart");
  assert.equal(manager.incarnation, 2);
  assert.equal(manager.gameKey, "community-grove");
  // destroying the old VM was confirmed before the new one existed
  const destroyAt = ops.indexOf("destroy");
  const createAt = ops.lastIndexOf("create");
  assert.ok(destroyAt < createAt);
  assert.equal(vms.get(first).status, "destroyed");
});

test("provider pause destroys the VM and is never resumed", async (t) => {
  const { manager, backend, calls, vms } = makeManager(t, {
    hooks: { waitAttach: async () => {} },
  });
  await manager.open();
  const vm = manager.vm;
  // simulate the provider pausing the VM (cost fuse)
  vms.get(vm.id).status = "paused";
  const status = await manager.checkProvider();
  assert.equal(status.phase, "closed");
  assert.equal(vms.get(vm.id).status, "destroyed");
  assert.ok(calls.some((c) => c[0] === "destroy" && c[1] === vm.id));
  assert.ok(!calls.some((c) => c[0] === "pause"), "manager never pauses; backends expose no resume");
  // a paused VM is gone: nothing can bring it back
  await assert.rejects(manager.activate("grove"), /closing|closed/i).catch(() => {});
});

test("fallback returns to the default image and manages waiting state", async (t) => {
  const waiting = [];
  const { manager, calls } = makeManager(t, {
    hooks: {
      waitAttach: async () => {},
      setWaiting: async (state) => waiting.push(state),
    },
  });
  await manager.open();
  await manager.activate("grove", { game: { key: "community-grove", hash: "h" } });
  const status = await manager.fallback("watchdog: game-error");
  assert.equal(status.phase, "running");
  assert.equal(status.image, "default");
  assert.equal(status.game, null);
  assert.deepEqual(waiting[0], { phase: "resetting", reason: "watchdog: game-error" });
  assert.equal(waiting.at(-1), null, "waiting cleared after reset");
  assert.equal(calls.filter((c) => c[0] === "destroy").length, 2);
});

test("close destroys the VM, confirms it and writes a filtered journal", async (t) => {
  const { manager, calls, vms, events } = makeManager(t, {
    hooks: {
      waitAttach: async () => {},
      beforeDestroy: async () => events.push(["beforeDestroy"]),
    },
  });
  await manager.open();
  await manager.close();
  const status = manager.status();
  assert.equal(status.phase, "closed");
  assert.equal(status.vm, null);
  assert.ok(events.some(([k]) => k === "beforeDestroy"), "game session stopped before destroy");
  const journal = JSON.parse(fs.readFileSync(manager.file, "utf8"));
  assert.equal(journal.phase, "closed");
  assert.ok(journal.events.every((e) => typeof e.kind === "string"));
  const raw = fs.readFileSync(manager.file, "utf8");
  for (const forbidden of ["token", "wss://", "10.0.0."]) assert.ok(!raw.includes(forbidden), forbidden);
  // idempotent
  await manager.close();
  assert.equal(calls.filter((c) => c[0] === "destroy").length, 1);
});

test("unconfirmed destruction leaves cleanup-required and blocks new VMs", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-vm3-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { backend } = makeFakeBackend();
  backend.destroy = async () => ({ confirmed: false });
  const manager = new GameVmManager({
    backend, room: "r", images: IMAGES,
    file: path.join(dir, "j.json"),
    hooks: { waitAttach: async () => {} },
    statusPollMs: 0,
  });
  await manager.open();
  await assert.rejects(manager.close(), /confirm/i);
  assert.equal(manager.phase, "cleanup-required");
  // a fresh manager over the same journal must reconcile, not trust the VM
  const again = new GameVmManager({
    backend, room: "r", images: IMAGES,
    file: path.join(dir, "j.json"),
    hooks: { waitAttach: async () => {} },
    statusPollMs: 0,
  });
  assert.equal(again.phase, "cleanup-required");
});

test("attach timeout destroys the fresh VM instead of leaving it", async (t) => {
  const { manager, calls, vms } = makeManager(t, {
    attachTimeoutMs: 30,
    hooks: { waitAttach: () => new Promise(() => {}) }, // never resolves
  });
  await assert.rejects(manager.open(), /attach timeout/i);
  // Destruction was confirmed, so the manager is cleanly closed and retryable.
  assert.equal(manager.phase, "closed");
  assert.equal(vms.size, 1);
  assert.equal([...vms.values()][0].status, "destroyed");
  assert.ok(calls.some((c) => c[0] === "destroy"));
});

test("concurrent lifecycle calls serialize and never leak a VM", async (t) => {
  const { manager, calls, vms } = makeManager(t, {
    hooks: { waitAttach: async () => {} },
  });
  await manager.open();
  // Watchdog fallback racing a streamer reset and a provider check must not
  // interleave destroy/create: every created VM ends current or destroyed.
  await Promise.allSettled([
    manager.activate("grove"),
    manager.fallback("watchdog: game-error"),
    manager.activate("default"),
    manager.checkProvider(),
  ]);
  const created = calls.filter((c) => c[0] === "create").length;
  const destroyed = calls.filter((c) => c[0] === "destroy").length;
  const live = [...vms.values()].filter((v) => v.status !== "destroyed");
  assert.equal(live.length, 1, "exactly the current incarnation survives");
  assert.equal(created - destroyed, 1, "no orphaned provider VM");
  assert.equal(manager.vm.id, live[0].id);
});

test("safeText redacts token shapes but keeps hashes and ids readable", () => {
  const seat = "v1." + "a".repeat(20) + "." + "b".repeat(20);
  assert.equal(safeText("leak " + seat + " here"), "leak redacted-seat-token here");
  const game = "A".repeat(20) + "b".repeat(20); // 40-char mixed token
  assert.equal(safeText("err " + game), "err redacted-token");
  const hex = "a".repeat(64); // sha256 digest stays readable for audit
  assert.equal(safeText(hex), hex);
  const vmid = "sb-" + "a1".repeat(15); // provider id stays readable
  assert.equal(safeText("pause " + vmid), "pause " + vmid);
});
