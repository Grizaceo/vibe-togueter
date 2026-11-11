// Backend tests: libvirt (virsh) and CreateOS (sandbox CLI) with injected
// fakes. No real hypervisor or provider calls — ever.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { libvirtBackend } from "../src/vm3/libvirt.js";
import { createosBackend } from "../src/vm3/createos.js";

test("libvirt backend defines, starts, observes and destroys domains", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-libvirt-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const template = path.join(dir, "domain.xml.tpl");
  fs.writeFileSync(template, `<domain><name>{{NAME}}</name><uuid>{{AGENT}}</uuid></domain>`);
  const calls = [];
  const domains = new Map();
  const run = async (argv) => {
    calls.push(argv.join(" "));
    const [cmd, ...rest] = argv.filter((a) => a !== "--connect" && a !== "qemu:///session");
    if (cmd === "define") { domains.set(path.basename(rest[0], ".xml"), "running"); return { code: 0, stdout: "" }; }
    if (cmd === "start") return { code: 0, stdout: "" };
    if (cmd === "domstate") {
      const d = domains.get(rest[0]);
      return d ? { code: 0, stdout: d + "\n" } : { code: 1, stdout: "", stderr: "not found" };
    }
    if (cmd === "destroy") { if (domains.has(rest[0])) domains.set(rest[0], "shut off"); return { code: 0, stdout: "" }; }
    if (cmd === "undefine") { domains.delete(rest[0]); return { code: 0, stdout: "" }; }
    return { code: 1, stdout: "", stderr: "unknown" };
  };
  const backend = libvirtBackend({ run, xmlDir: dir, templateFile: template, agentDir: dir });
  const agent = { funnelUrl: "wss://f", room: "r", token: "tok", imageKey: "default" };
  const vm = await backend.create({ name: "va-game-r-1", image: "va-game:1", agent });
  assert.equal(vm.id, "va-game-r-1");
  assert.equal(await backend.status(vm), "running");
  // agent creds staged for the guest, never in argv
  const staged = JSON.parse(fs.readFileSync(path.join(dir, "va-game-r-1.json"), "utf8"));
  assert.equal(staged.token, "tok");
  assert.ok(!calls.some((c) => c.includes("tok")), "token never on the virsh command line");
  const result = await backend.destroy(vm);
  assert.equal(result.confirmed, true);
  assert.equal(await backend.status(vm), "missing");
  const undef = calls.find((c) => c.startsWith("undefine"));
  assert.ok(undef.includes("--nvram"));
});

test("libvirt destroy reports unconfirmed when the domain survives", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-libvirt-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const template = path.join(dir, "d.xml");
  fs.writeFileSync(template, "<domain><name>{{NAME}}</name></domain>");
  const run = async (argv) => {
    const cmd = argv.find((a) => ["define", "start", "domstate", "destroy", "undefine"].includes(a));
    if (cmd === "undefine") return { code: 1, stdout: "", stderr: "busy" };
    if (cmd === "domstate") return { code: 0, stdout: "running\n" };
    return { code: 0, stdout: "" };
  };
  const backend = libvirtBackend({ run, xmlDir: dir, templateFile: template });
  const result = await backend.destroy({ id: "va-game-x-1" });
  assert.equal(result.confirmed, false);
});

test("createos backend creates, launches agent with env creds, confirms destroy", async (t) => {
  const calls = [];
  const vms = new Map();
  let seq = 0;
  const cli = async (args) => {
    calls.push(args.join(" "));
    const [group, cmd, ...rest] = args;
    assert.equal(group, "sandbox");
    if (cmd === "create") {
      const id = "sb-" + "a".repeat(20) + (++seq);
      vms.set(id, { id, status: "running" });
      return JSON.stringify({ id });
    }
    if (cmd === "get") {
      const vm = vms.get(rest[0]);
      if (!vm) throw Error("not found");
      return JSON.stringify(vm);
    }
    if (cmd === "process" && rest[0] === "start") {
      assert.ok(rest.includes("VA_GAME_TOKEN=secret-token-123"), "agent env carries the token");
      return JSON.stringify({ process_id: "proc_1" });
    }
    if (cmd === "rm") {
      const vm = vms.get(rest[0]);
      if (vm) vm.status = "deleted";
      return "{}";
    }
    throw Error("unexpected cli: " + args.join(" "));
  };
  const backend = createosBackend({ cli, egress: ["api.openai.com"] });
  const agent = { funnelUrl: "wss://funnel.example", room: "room-1", token: "secret-token-123", imageKey: "default" };
  const vm = await backend.create({ name: "va-game-room-1-1", image: "va-game:1", agent });
  assert.match(vm.id, /^sb-a{20}\d$/);
  assert.equal(vm.processId, "proc_1");
  assert.equal(await backend.status(vm), "running");
  // pause observed -> status reports paused (manager destroys; never resumes)
  vms.get(vm.id).status = "paused";
  assert.equal(await backend.status(vm), "paused");
  const result = await backend.destroy(vm);
  assert.equal(result.confirmed, true);
  assert.equal(result.terminalStatus, "deleted");
  assert.equal(await backend.status(vm), "missing");
  // auto-pause fuse configured at create
  const createCall = calls.find((c) => c.includes("create"));
  assert.ok(createCall.includes("--auto-pause 5m"));
  assert.ok(createCall.includes("--egress api.openai.com"));
  // the raw token appears only inside the process-start env, not in sandbox create
  const createOnly = calls.filter((c) => c.includes("sandbox create"));
  assert.ok(!createOnly.some((c) => c.includes("secret-token")));
});

test("createos destroy is unconfirmed while the provider still reports running", async () => {
  const cli = async (args) => {
    const cmd = args[1];
    if (cmd === "rm") return "{}";
    if (cmd === "get") return JSON.stringify({ id: "sb-" + "b".repeat(20) + "1", status: "running" });
    throw Error("unexpected " + args.join(" "));
  };
  const backend = createosBackend({ cli });
  const result = await backend.destroy({ id: "sb-" + "b".repeat(20) + "1" });
  assert.equal(result.confirmed, false);
});
