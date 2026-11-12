// CreateOS backend for VM3 (docs/platform/VM3_RUNTIME.md §3). All provider
// access goes through the injected `cli(args, options) -> stdout` — tests
// fake it, production wires the createos CLI. Lifecycle rules mirror
// vm-builder-preflight/builder-lease-control: observe exact identities,
// confirm destruction, never resume a paused VM.
const VM_ID = /^sb-[a-z0-9]{20,40}$/;
const TERMINAL = new Set(["deleted", "destroyed", "missing", "not-found", "terminated"]);
const T_PUSH = 300000;
const T_CMD = 60000;
const NOT_FOUND = /not.?found|404|no such|missing/i;

export function createosBackend({
  cli,
  name = "createos",
  shape = "s-1vcpu-2gb",
  autoPause = "5m",
  egress = [],
  agentCommand = "/app/guest-agent.js",
  nodeBin = "node",
  rootfs = "devbox:1",
  files = [],
  setup = [],
  agentCwd = null,
  agentEnv = {},
  destroyPolls = 30,
  destroyPollMs = 1000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
} = {}) {
  if (typeof cli !== "function") throw Error("createosBackend needs an injected cli().");
  const json = async (args, options) => JSON.parse(await cli(args, options));

  // rm --force then poll `get` until the provider reports a terminal state
  // (or the VM is gone). Only a confirmed terminal state counts.
  async function destroyVm(vm) {
    await cli(["sandbox", "rm", vm.id, "--force"], { timeout: T_CMD });
    let terminalStatus = "unknown";
    for (let attempt = 0; attempt < destroyPolls; attempt++) {
      if (attempt > 0) await sleep(destroyPollMs);
      try {
        const got = await json(["sandbox", "get", vm.id], { timeout: T_CMD });
        const s = String(got?.status || "").toLowerCase();
        if (got?.id !== vm.id || TERMINAL.has(s))
          return { confirmed: true, terminalStatus: s || "missing" };
        terminalStatus = s || "unknown";
      } catch (error) {
        if (NOT_FOUND.test(String(error?.message || error)))
          return { confirmed: true, terminalStatus: "missing" };
        terminalStatus = "unreachable";
      }
    }
    return { confirmed: false, terminalStatus };
  }

  return {
    name,
    // spec.ref is the rootfs image for this game incarnation; the backend
    // default covers specs that carry none.
    async create({ name: vmName, image, agent }) {
      const rootfsImage = String(image || rootfs);
      const args = [
        "sandbox", "create",
        "--shape", shape,
        "--rootfs", rootfsImage,
        "--name", String(vmName).slice(0, 60),
        "--auto-pause", autoPause,
        ...egress.flatMap((host) => ["--egress", host]),
      ];
      const created = await json(args, { timeout: T_CMD });
      if (!VM_ID.test(created?.id || ""))
        throw Error("Provider did not return a fresh VM identity.");
      try {
        // Confirm the exact identity before doing anything else.
        const vm = await json(["sandbox", "get", created.id], { timeout: T_CMD });
        if (vm?.id !== created.id) throw Error("Provider identity mismatch.");
        for (const file of files)
          await cli(["sandbox", "push", created.id, file.local, file.remote], {
            timeout: T_PUSH,
          });
        for (const argv of setup)
          await cli(["sandbox", "exec", created.id, "--", ...argv], {
            timeout: T_CMD,
          });
        // Launch the guest agent with per-incarnation credentials as env.
        // `env` keeps secrets out of the process argv where the provider allows.
        const env = [
          `VA_FUNNEL_URL=${agent.funnelUrl}`,
          `VA_ROOM=${agent.room}`,
          `VA_GAME_TOKEN=${agent.token}`,
          `VA_IMAGE_KEY=${agent.imageKey || ""}`,
          `VA_GAME_KIND=${agent.kind || "sdk"}`,
          ...(agent.mode ? [`VA_TEE_MODE=${agent.mode}`] : []),
          ...Object.entries(agentEnv).map(([key, value]) => `${key}=${value}`),
        ];
        const start = ["sandbox", "process", "start", created.id];
        if (agentCwd) start.push("--cwd", agentCwd);
        start.push("--", "env", ...env, nodeBin, agentCommand);
        const started = await json(start, { timeout: T_CMD });
        return {
          id: created.id,
          processId: started?.process_id || null,
          name: vmName,
          rootfs: rootfsImage,
        };
      } catch (error) {
        // Anything after `sandbox create` must not leak a VM the manager
        // never received: destroy it (polling) before rethrowing.
        let destroyed = null;
        try {
          destroyed = await destroyVm({ id: created.id });
        } catch {}
        if (destroyed && !destroyed.confirmed)
          throw Error(
            `Provision failed and VM ${created.id} destruction is unconfirmed; reconcile it manually.`,
          );
        throw error;
      }
    },
    async status(vm) {
      try {
        const got = await json(["sandbox", "get", vm.id], { timeout: T_CMD });
        const s = String(got?.status || "").toLowerCase();
        if (TERMINAL.has(s) || got?.id !== vm.id) return "missing";
        return s === "paused" ? "paused" : s === "running" ? "running" : s;
      } catch {
        return "missing";
      }
    },
    destroy: destroyVm,
  };
}
