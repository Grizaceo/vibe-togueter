// CreateOS backend for VM3 (docs/platform/VM3_RUNTIME.md §3). All provider
// access goes through the injected `cli(args) -> stdout` — tests fake it,
// production wires the createos CLI. Lifecycle rules mirror
// vm-builder-preflight/builder-lease-control: observe exact identities,
// confirm destruction, never resume a paused VM.
const VM_ID = /^sb-[a-z0-9]{20,40}$/;
const TERMINAL = new Set(["deleted", "destroyed", "missing", "not-found", "terminated"]);

export function createosBackend({
  cli,
  name = "createos",
  shape = "s-1vcpu-2gb",
  autoPause = "5m",
  egress = [],
  agentCommand = "/app/guest-agent.js",
  nodeBin = "node",
  now = Date.now,
} = {}) {
  if (typeof cli !== "function") throw Error("createosBackend needs an injected cli().");
  const json = async (args, options) => JSON.parse(await cli(args, options));

  return {
    name,
    // spec.ref is the rootfs image for this game incarnation.
    async create({ name: vmName, image: rootfs, agent }) {
      const args = [
        "sandbox", "create",
        "--shape", shape,
        "--rootfs", String(rootfs || "va-game:1"),
        "--name", String(vmName).slice(0, 60),
        "--auto-pause", autoPause,
        ...egress.flatMap((host) => ["--egress", host]),
      ];
      const created = await json(args);
      if (!VM_ID.test(created?.id || ""))
        throw Error("Provider did not return a fresh VM identity.");
      // Confirm the exact identity before doing anything else.
      const vm = await json(["sandbox", "get", created.id]);
      if (vm?.id !== created.id) throw Error("Provider identity mismatch.");
      // Launch the guest agent with per-incarnation credentials as env.
      // `env` keeps secrets out of the process argv where the provider allows.
      const env = [
        `VA_FUNNEL_URL=${agent.funnelUrl}`,
        `VA_ROOM=${agent.room}`,
        `VA_GAME_TOKEN=${agent.token}`,
        `VA_IMAGE_KEY=${agent.imageKey || ""}`,
        `VA_GAME_KIND=${agent.kind || "sdk"}`,
        ...(agent.mode ? [`VA_TEE_MODE=${agent.mode}`] : []),
      ];
      const started = await json([
        "sandbox", "process", "start", created.id, "--",
        "env", ...env, nodeBin, agentCommand,
      ]);
      return { id: created.id, processId: started?.process_id || null, name: vmName, rootfs };
    },
    async status(vm) {
      try {
        const got = await json(["sandbox", "get", vm.id]);
        const s = String(got?.status || "").toLowerCase();
        if (TERMINAL.has(s) || got?.id !== vm.id) return "missing";
        return s === "paused" ? "paused" : s === "running" ? "running" : s;
      } catch {
        return "missing";
      }
    },
    async destroy(vm) {
      await cli(["sandbox", "rm", vm.id, "--force"]);
      // Confirm the terminal state at the provider; never assume.
      let terminal = "destroyed";
      try {
        const got = await json(["sandbox", "get", vm.id]);
        const s = String(got?.status || "").toLowerCase();
        if (!TERMINAL.has(s) && got?.id === vm.id) return { confirmed: false, terminalStatus: s || "unknown" };
        terminal = s || "destroyed";
      } catch {
        terminal = "missing";
      }
      return { confirmed: true, terminalStatus: terminal };
    },
  };
}
