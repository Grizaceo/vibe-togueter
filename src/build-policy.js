// Build execution is an owner policy, never an instruction in chat/model output.
export function buildPolicy(config = {}, env = process.env) {
  const mode = env.VA_BUILD_MODE || config.execution || "cloud-vm";
  if (!["cloud-vm", "trusted-local"].includes(mode))
    throw new Error("Unknown build execution mode.");
  return Object.freeze({
    mode,
    profile: config.agentProfile || "owner-default",
    localAllowed: mode === "trusted-local",
    fallbackToLocal: false,
    requiredIsolation: mode === "cloud-vm" ? "separate-build-vm" : null,
  });
}
export function localBuildPermission(policy) {
  if (policy.localAllowed) return { ok: true, execution: "trusted-local" };
  return {
    ok: false,
    code: "isolated_builder_required",
    execution: "cloud-vm",
    reason:
      "Connect an isolated VM builder. Construction on the streamer PC is disabled; there is no local fallback.",
  };
}
