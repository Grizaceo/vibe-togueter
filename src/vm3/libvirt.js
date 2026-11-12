// Local QEMU/KVM backend for VM3 via libvirt/virsh (self-hosting path,
// docs/platform/VM3_RUNTIME.md §3). All hypervisor access goes through the
// injected `run(argv) -> {code, stdout, stderr}` — tests fake it. Each game
// incarnation is a fresh domain defined from the configured XML template;
// clean reset = destroy + undefine + define + start, never reboot-in-place.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DOMAIN = /^[a-zA-Z0-9_.-]{1,120}$/;

export function libvirtBackend({
  run,
  name = "libvirt",
  xmlDir,
  templateFile,
  agentDir = null, // where per-incarnation agent creds are staged for the guest
  conn = null,     // e.g. "qemu:///system"; passed as --connect
} = {}) {
  if (typeof run !== "function") throw Error("libvirtBackend needs an injected run().");
  if (!xmlDir || !templateFile)
    throw Error("libvirtBackend needs xmlDir and templateFile.");
  const virsh = (args) => run(conn ? ["--connect", conn, ...args] : args);

  function renderXml(domain, agent) {
    const tpl = fs.readFileSync(templateFile, "utf8");
    // The template carries {{NAME}} and {{AGENT}} placeholders; the agent
    // blob is base64 JSON consumed by the image's init (config drive/9p —
    // delivery mechanism is an open owner question, see VM3_RUNTIME §8).
    const agentJson = agent ? Buffer.from(JSON.stringify(agent)).toString("base64") : "";
    return tpl
      .replaceAll("{{NAME}}", domain)
      .replaceAll("{{AGENT}}", agentJson)
      .replaceAll("{{AGENT_FILE}}", agentDir ? path.join(agentDir, domain + ".json") : "");
  }

  return {
    name,
    async create({ name: domain, image, agent }) {
      if (!DOMAIN.test(domain)) throw Error("Invalid domain name.");
      // Stage agent creds for the guest (0600, outside any public path).
      if (agentDir) {
        fs.mkdirSync(agentDir, { recursive: true });
        const file = path.join(agentDir, domain + ".json");
        fs.writeFileSync(file, JSON.stringify(agent), { mode: 0o600 });
      }
      const xmlFile = path.join(xmlDir, domain + ".xml");
      fs.writeFileSync(xmlFile, renderXml(domain, agent), { mode: 0o600 });
      try {
        await virsh(["define", xmlFile]);
        await virsh(["start", domain]);
      } catch (error) {
        // Never leave a half-defined domain behind.
        await virsh(["undefine", domain, "--nvram"]).catch(() => {});
        throw error;
      }
      return { id: domain, name: domain, image };
    },
    async status(vm) {
      const result = await virsh(["domstate", vm.id]);
      if (result.code !== 0) return "missing";
      const state = String(result.stdout || "").trim().toLowerCase();
      if (state === "running") return "running";
      if (state === "paused") return "paused";
      if (["shut off", "shutoff", "crashed", "dying"].includes(state)) return "stopped";
      return state || "unknown";
    },
    async destroy(vm) {
      if (!DOMAIN.test(vm.id)) throw Error("Invalid domain name.");
      // Power off if needed, then undefine: the domain ceases to exist.
      await virsh(["destroy", vm.id]).catch(() => {});
      const undef = await virsh(["undefine", vm.id, "--nvram"]);
      if (undef.code !== 0) return { confirmed: false, terminalStatus: "undefine-failed" };
      const after = await virsh(["domstate", vm.id]);
      const confirmed = after.code !== 0; // domstate errors once undefined
      return { confirmed, terminalStatus: confirmed ? "destroyed" : "still-defined" };
    },
  };
}
