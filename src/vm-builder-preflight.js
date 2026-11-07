// CreateOS operator preflight. Only fixed trusted probes run in the fresh VM.
// This is not a coding worker; there is no model request or candidate execution.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
export const TRIAL_PROFILE = Object.freeze({
  agent: "codex",
  model: "gpt-6.1-terra",
  shape: "s-1vcpu-2gb",
  rootfs: "devbox:1",
  vmBudgetMinor: 300,
  paidApiBudgetMinor: 0,
  authentication: "chatgpt-subscription",
  currency: "USD",
  autoPause: "5m",
  maxProbeMs: 60000,
  ingress: false,
  egress: [
    "api.openai.com",
    "registry.npmjs.org",
    "auth.openai.com",
    "chatgpt.com",
  ],
});
const probe = `const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'); const version=cp.execFileSync('codex',['--version'],{encoding:'utf8',timeout:15000}).trim(); console.log(JSON.stringify({node:process.version,codex:version,platform:process.platform,arch:process.arch,personalAuthPresent:fs.existsSync(path.join(os.homedir(),'.codex','auth.json')),credentialEnvironmentPresent:Object.keys(process.env).some(k=>/TWITCH|OPENAI_API_KEY|VA_ADMIN_TOKEN|VA_STREAMER_KEY/.test(k))}));`;
const ownId = (id) => typeof id === "string" && /^sb-[a-z0-9]{20,40}$/.test(id);
// The probe receipt is persisted; an allowlist keeps anything else or a wrong
// type out of the journal instead of storing a raw provider-controlled value.
export function sanitizeProbeReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt))
    throw Error("Invalid probe receipt.");
  if (
    JSON.stringify(Object.keys(receipt).sort()) !==
    JSON.stringify(
      [
        "node",
        "codex",
        "platform",
        "arch",
        "personalAuthPresent",
        "credentialEnvironmentPresent",
      ].sort(),
    )
  )
    throw Error("Invalid probe receipt.");
  for (const key of ["node", "codex", "platform", "arch"])
    if (typeof receipt[key] !== "string" || receipt[key].length > 100)
      throw Error("Invalid probe receipt.");
  for (const key of [
    "personalAuthPresent",
    "credentialEnvironmentPresent",
  ])
    if (typeof receipt[key] !== "boolean")
      throw Error("Invalid probe receipt.");
  return {
    node: receipt.node,
    codex: receipt.codex,
    platform: receipt.platform,
    arch: receipt.arch,
    personalAuthPresent: receipt.personalAuthPresent,
    credentialEnvironmentPresent: receipt.credentialEnvironmentPresent,
  };
}
export function validateBuildSession(state, now = Date.now()) {
  if (
    state?.phase !== "awaiting-login" ||
    !Number.isFinite(state.expiresAt) ||
    state.expiresAt < now + 7 * 60 * 1000 ||
    !/^vibe-arena-builder-[a-f0-9]{12}$/.test(state.cleanupUnit || "")
  )
    throw Error(
      "Builder session needs a valid expiry and verified cleanup timer.",
    );
  return state.cleanupUnit;
}
export class VMBuilderPreflight {
  constructor(file, { run = execute } = {}) {
    this.file = file;
    this.run = run;
    this.state = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : null;
    if (
      this.state &&
      (!/^(?:va-build-probe-[a-f0-9]{24}|va-build-[a-f0-9]{12,20})$/.test(
        this.state.name,
      ) ||
        !Number.isSafeInteger(this.state.requestedAt) ||
        ![
          "creating",
          "probing",
          "awaiting-login",
          "cleanup-required",
          "released",
        ].includes(this.state.phase) ||
        !Array.isArray(this.state.existingIds) ||
        this.state.existingIds.some((id) => !ownId(id)) ||
        (this.state.id !== null && !ownId(this.state.id)))
    )
      throw Error("Invalid VM probe journal; preserve and inspect it.");
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + "." + crypto.randomUUID() + ".tmp";
    let fd;
    try {
      fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify(this.state) + "\n");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, this.file);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  async cli(args, options = {}) {
    try {
      const result = await this.run("createos", args, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        ...options,
      });
      return result.stdout;
    } catch (error) {
      // Provider diagnostics can include sensitive details; retain sizes and
      // hashes only, never raw stdout/stderr text.
      const hash = (value) =>
        crypto.createHash("sha256").update(value || "").digest("hex");
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(
        this.file + ".diagnostic.json",
        JSON.stringify({
          operation: args[1],
          exit: error.code ?? null,
          signal: error.signal ?? null,
          killed: !!error.killed,
          stdoutBytes: Buffer.byteLength(error.stdout || ""),
          stdoutSha256: hash(error.stdout),
          stderrBytes: Buffer.byteLength(error.stderr || ""),
          stderrSha256: hash(error.stderr),
          at: new Date().toISOString(),
        }) + "\n",
        { mode: 0o600 },
      );
      throw error;
    }
  }
  owned(vm) {
    if (
      !vm ||
      !ownId(vm.id) ||
      vm.name !== this.state.name ||
      !Number.isFinite(Date.parse(vm.created_at)) ||
      Date.parse(vm.created_at) < this.state.requestedAt - 5000 ||
      vm.shape !== TRIAL_PROFILE.shape ||
      vm.rootfs !== TRIAL_PROFILE.rootfs ||
      vm.ingress_enabled !== false
    )
      throw Error(
        "VM ownership/settings mismatch; no destructive operation performed.",
      );
    if (this.state.existingIds.includes(vm.id))
      throw Error(
        "VM existed before this trial; no destructive operation performed.",
      );
    if (this.state.id && vm.id !== this.state.id)
      throw Error("VM identity changed; no destructive operation performed.");
    return vm;
  }
  async release() {
    if (!this.state || this.state.phase === "released") return this.state;
    if (this.state.id === null && this.state.creationRequested === false) {
      this.state.phase = "released";
      this.state.releasedAt = Date.now();
      this.state.providerTerminalStatus = "not-created";
      this.save();
      return structuredClone(this.state);
    }
    this.state.phase = "cleanup-required";
    try {
      this.save();
    } catch {}
    // Exact fresh ID or unique random name only. Never touch existing game VMs.
    let vm;
    if (this.state.id)
      vm = JSON.parse(await this.cli(["sandbox", "get", this.state.id]));
    else {
      const matches = JSON.parse(
        await this.cli(["sandbox", "list", "--all", "--limit", "100"]),
      ).filter((v) => v.name === this.state.name);
      if (matches.length !== 1)
        throw Error(
          "Ambiguous creation; inspect provider state before retrying.",
        );
      vm = matches[0];
    }
    this.owned(vm);
    this.state.id = vm.id;
    try {
      this.save();
    } catch {}
    if (vm.status !== "destroyed")
      await this.cli(["sandbox", "rm", vm.id, "--force"]);
    // Confirm the terminal state; an acknowledgement alone is not cleanup evidence.
    let ended;
    for (let attempt = 0; attempt < 8; attempt++) {
      let output;
      try {
        output = await this.cli(["sandbox", "get", vm.id], { timeout: 3000 });
      } catch {
        /* A lost observation never repeats create/delete. */
      }
      if (output?.trim()) {
        let value;
        try {
          value = JSON.parse(output);
        } catch {}
        if (value) {
          ended = this.owned(value);
          if (ended.status === "destroyed") break;
        }
      }
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (ended?.status !== "destroyed")
      throw Error("VM destruction not confirmed.");
    this.state.phase = "released";
    this.state.releasedAt = Date.now();
    this.state.providerTerminalStatus = ended.status;
    try {
      this.save();
    } catch {
      this.state.phase = "cleanup-required";
      throw Error("VM destroyed but journal persistence needs reconciliation.");
    }
    return structuredClone(this.state);
  }
  async preflight({ signal, retainForLogin = false, beforeCreate } = {}) {
    if (this.state && this.state.phase !== "released")
      throw Error(
        "Unreconciled VM probe exists; recover it before creating another.",
      );
    signal?.throwIfAborted();
    // Inventory is read-only. No existing VM is reused as a builder.
    const inventory = JSON.parse(
      await this.cli(["sandbox", "list", "--limit", "100"]),
    );
    if (!Array.isArray(inventory)) throw Error("Invalid provider inventory.");
    signal?.throwIfAborted();
    this.state = {
      version: 1,
      name: "va-build-" + crypto.randomBytes(6).toString("hex"),
      id: null,
      requestedAt: Date.now(),
      phase: "creating",
      creationRequested: false,
      profile: TRIAL_PROFILE,
      existingIds: inventory.map((vm) => vm.id),
      result: null,
    };
    this.save();
    let failure;
    let fullyPrepared = false;
    try {
      signal?.throwIfAborted();
      if (beforeCreate) await beforeCreate(structuredClone(this.state));
      signal?.throwIfAborted();
      if (
        Number.isFinite(this.state.expiresAt) &&
        Date.now() >= this.state.expiresAt
      )
        throw Error("VM cleanup lease expired before creation.");
      this.state.creationRequested = true;
      this.save();
      const created = JSON.parse(
        await this.cli(
          [
            "sandbox",
            "create",
            "--shape",
            TRIAL_PROFILE.shape,
            "--rootfs",
            TRIAL_PROFILE.rootfs,
            "--name",
            this.state.name,
            "--auto-pause",
            TRIAL_PROFILE.autoPause,
            ...TRIAL_PROFILE.egress.flatMap((host) => ["--egress", host]),
          ],
          { signal },
        ),
      );
      if (!ownId(created.id) || this.state.existingIds.includes(created.id))
        throw Error("Provider did not return a fresh VM identity.");
      this.state.id = created.id;
      this.save();
      const vm = JSON.parse(
        await this.cli(["sandbox", "get", created.id], { signal }),
      );
      this.owned(vm);
      this.state.id = vm.id;
      this.state.phase = "probing";
      this.save();
      signal?.throwIfAborted();
      let receipt = sanitizeProbeReceipt(
        JSON.parse(
          await this.cli(
            ["sandbox", "exec", vm.id, "--", "node", "-e", probe],
            { signal, timeout: TRIAL_PROFILE.maxProbeMs },
          ),
        ),
      );
      this.state.probeReceipt = receipt;
      this.save();
      if (
        receipt.platform !== "linux" ||
        typeof receipt.codex !== "string" ||
        !/^codex-cli \d+\.\d+\.\d+/.test(receipt.codex) ||
        receipt.personalAuthPresent !== false ||
        receipt.credentialEnvironmentPresent !== false
      )
        throw Error(
          "Fresh VM preflight failed; no agent authorization attempted.",
        );
      let [major, minor] = receipt.codex
        .match(/(\d+)\.(\d+)\.\d+/)
        .slice(1)
        .map(Number);
      if (major === 0 && minor < 159) {
        this.state.toolUpdate = {
          package: "@openai/codex",
          version: "0.166.0",
          status: "installing",
        };
        this.save();
        await this.cli(
          [
            "sandbox",
            "exec",
            vm.id,
            "--",
            "npm",
            "install",
            "--global",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "@openai/codex@0.166.0",
          ],
          { signal, timeout: 45000 },
        );
        receipt = sanitizeProbeReceipt(
          JSON.parse(
            await this.cli(
              ["sandbox", "exec", vm.id, "--", "node", "-e", probe],
              { signal },
            ),
          ),
        );
        this.state.probeReceipt = receipt;
        this.state.toolUpdate.status = "installed";
        this.save();
        if (
          !/^codex-cli 0\.166\.0$/.test(receipt.codex) ||
          receipt.personalAuthPresent !== false ||
          receipt.credentialEnvironmentPresent !== false
        )
          throw Error("Pinned guest Codex update could not be verified.");
      }
      this.state.result = {
        ...receipt,
        modelRequested: TRIAL_PROFILE.model,
        modelAuthenticated: false,
        candidateExecuted: false,
      };
      if (retainForLogin) this.state.phase = "awaiting-login";
      this.save();
      fullyPrepared = true;
    } catch (error) {
      failure = Error(
        "VM preflight incomplete; inspect the protected journal and retained evidence.",
      );
      this.state.failureKind = error.name;
      if (
        error.message.startsWith("VM ") ||
        error.message.startsWith("Provider ") ||
        error.message.startsWith("Guest ")
      )
        this.state.failureMessage = error.message;
      try {
        this.save();
      } catch {}
    } finally {
      try {
        if (!fullyPrepared || failure || !retainForLogin) await this.release();
      } catch {
        throw Error(
          "VM cleanup requires reconciliation; no further VM may be created by this helper.",
        );
      }
    }
    if (failure) throw failure;
    return structuredClone(this.state);
  }
}
