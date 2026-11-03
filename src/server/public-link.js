// Public entry link handed out by !join. A URL is only returned after a probe
// sent through that URL reaches this exact controller process, so a stale
// VA_PUBLIC_URL or an expired quick tunnel is never posted in chat.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as spawnProcess } from "node:child_process";

export const LINK_PROBE_PATH = "/__va/link-probe";
export const QUICK_TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
// cloudflared binds its metrics server to the first free port in this range.
const METRICS_PORTS = [20241, 20242, 20243, 20244, 20245];
const MODES = ["auto", "detect", "off"];

export function tunnelMode(value) {
  const mode = String(value || "auto").toLowerCase();
  if (!MODES.includes(mode))
    throw Error("VA_TUNNEL must be one of: " + MODES.join(", ") + ".");
  return mode;
}

// Only bare origins are accepted; a public link never carries credentials or a query.
export function publicOrigin(value) {
  try {
    const url = new URL(String(value));
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export class PublicLink {
  constructor({
    configuredURL = "",
    mode = "auto",
    allowSpawn = true,
    disabledReason = "",
    command = "cloudflared",
    spawn = spawnProcess,
    fetch: fetchImpl = globalThis.fetch,
    log = () => {},
    checkEveryMs = 30000,
    startTimeoutMs = 45000,
    retryEveryMs = 2000,
    probeTimeoutMs = 5000,
    metricsPorts = METRICS_PORTS,
    tunnelPattern = QUICK_TUNNEL_URL,
  } = {}) {
    Object.assign(this, {
      configuredURL: configuredURL ? publicOrigin(configuredURL) : null,
      configuredInvalid: Boolean(configuredURL) && !publicOrigin(configuredURL),
      mode: tunnelMode(mode),
      allowSpawn,
      disabledReason,
      command,
      spawnImpl: spawn,
      fetchImpl,
      log,
      checkEveryMs,
      startTimeoutMs,
      retryEveryMs,
      probeTimeoutMs,
      metricsPorts,
      tunnelPattern,
    });
    this.nonce = crypto.randomBytes(16).toString("hex");
    this.current = null; // {url, source: configured|detected|spawned}
    this.state = this.mode === "off" ? "off" : "starting";
    this.reason =
      this.mode === "off"
        ? disabledReason || "Public link disabled (VA_TUNNEL=off)."
        : "Looking for a public tunnel.";
    this.checkedAt = null;
    this.failures = 0;
    this.child = null;
    this.busy = null;
    this.stopped = false;
  }

  get url() {
    return this.state === "live" ? this.current.url : null;
  }

  status() {
    return {
      mode: this.mode,
      state: this.state,
      url: this.url,
      source: this.state === "live" ? this.current.source : null,
      reason: this.reason,
      checkedAt: this.checkedAt,
    };
  }

  handleProbe(req, res) {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ vibeArena: this.nonce }));
  }

  async probe(origin) {
    try {
      const response = await this.fetchImpl(origin + LINK_PROBE_PATH, {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(this.probeTimeoutMs),
      });
      if (!response.ok) return false;
      return (await response.json())?.vibeArena === this.nonce;
    } catch {
      return false;
    }
  }

  async start(port) {
    this.port = port;
    if (this.mode === "off") return this.status();
    await this.refresh();
    this.timer = setInterval(() => this.refresh(), this.checkEveryMs);
    this.timer.unref?.();
    return this.status();
  }

  // Serialised: health checks, tunnel exits and startup never race each other.
  refresh() {
    if (this.stopped || this.mode === "off") return Promise.resolve();
    this.busy ??= this._refresh().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }

  async _refresh() {
    if (this.current) {
      if (await this.probe(this.current.url)) {
        this._live(this.current);
        return;
      }
      if (++this.failures < 2 && this.state === "live") return;
      this._down("Public link stopped answering: " + this.current.url);
      this._killChild();
    }
    const found = await this._establish();
    if (this.stopped) return;
    if (found) this._live(found);
    else if (!this.current) this.state = "down";
  }

  async _establish() {
    if (this.configuredURL && (await this.probe(this.configuredURL)))
      return { url: this.configuredURL, source: "configured" };
    const detected = await this._detect();
    if (detected) return { url: detected, source: "detected" };
    if (this.mode !== "auto") {
      this.reason = this._missingReason("VA_TUNNEL=detect never starts one.");
      return null;
    }
    if (!this.allowSpawn) {
      this.reason = this._missingReason(this.disabledReason);
      return null;
    }
    const spawned = await this._spawnTunnel();
    return spawned ? { url: spawned, source: "spawned" } : null;
  }

  _missingReason(detail) {
    const stale = this.configuredURL
      ? "Configured VA_PUBLIC_URL does not reach this arena. "
      : this.configuredInvalid
        ? "Configured VA_PUBLIC_URL is not a bare http(s) origin. "
        : "";
    return (stale + "No live tunnel found. " + (detail || "")).trim();
  }

  async _detect() {
    for (const port of this.metricsPorts) {
      try {
        const response = await this.fetchImpl(
          `http://127.0.0.1:${port}/quicktunnel`,
          { signal: AbortSignal.timeout(1000) },
        );
        if (!response.ok) continue;
        const hostname = (await response.json())?.hostname;
        const origin = publicOrigin("https://" + hostname);
        if (
          typeof hostname === "string" &&
          origin &&
          this.tunnelPattern.test(origin) &&
          (await this.probe(origin))
        )
          return origin;
      } catch {}
    }
    return null;
  }

  async _spawnTunnel() {
    // An empty config keeps a personal ~/.cloudflared/config.yml from turning
    // the quick tunnel into a named one (cloudflared refuses that combination).
    this.configFile ??= path.join(
      os.tmpdir(),
      `va-cloudflared-${process.pid}-${this.nonce.slice(0, 8)}.yml`,
    );
    fs.writeFileSync(this.configFile, "{}\n", { mode: 0o600 });
    this._killChild();
    let child,
      failure = "cloudflared did not publish a tunnel URL.";
    try {
      child = this.spawnImpl(
        this.command,
        [
          "tunnel",
          "--config",
          this.configFile,
          "--no-autoupdate",
          "--url",
          `http://127.0.0.1:${this.port}`,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (error) {
      this.reason = "Cannot start cloudflared: " + error.message;
      return null;
    }
    this.child = child;
    const deadline = Date.now() + this.startTimeoutMs;
    const origin = await new Promise((resolve) => {
      let text = "",
        found = null,
        registered = false,
        settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish(found), this.startTimeoutMs);
      const observe = (chunk) => {
        text = (text + chunk.toString()).slice(-16384);
        found ??= this.tunnelPattern.exec(text)?.[0] || null;
        registered ||= /Registered tunnel connection/i.test(text);
        if (found && registered) finish(found);
      };
      child.stdout?.on("data", observe);
      child.stderr?.on("data", observe);
      child.once("error", (error) => {
        failure = "Cannot start cloudflared: " + error.message;
        finish(null);
      });
      child.once("exit", (code, signal) => {
        failure = `cloudflared exited before publishing a URL (${signal || code}).`;
        finish(null);
      });
    });
    child.once("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      if (this.stopped) return;
      this._down(`Tunnel process exited (${signal || code}).`);
      setTimeout(() => this.refresh(), this.retryEveryMs).unref?.();
    });
    if (!origin || this.child !== child) {
      if (!origin && this.child === child) {
        this.reason = failure;
        this._killChild();
      }
      return null;
    }
    // A fresh hostname can take a few seconds to resolve; wait until it answers.
    while (!this.stopped && this.child === child && Date.now() < deadline) {
      if (await this.probe(origin)) return origin;
      await new Promise((r) => setTimeout(r, this.retryEveryMs));
    }
    this.reason = "Quick tunnel " + origin + " never reached this arena.";
    this._killChild();
    return null;
  }

  _live(found) {
    const changed = this.current?.url !== found.url || this.state !== "live";
    this.current = found;
    this.state = "live";
    this.failures = 0;
    this.checkedAt = new Date().toISOString();
    this.reason = "";
    if (changed) this.log(`public link -> ${found.url} (${found.source})`);
  }

  _down(reason) {
    if (this.state === "live") this.log("public link down: " + reason);
    this.state = "down";
    this.current = null;
    this.failures = 0;
    this.reason = reason;
    this.checkedAt = new Date().toISOString();
  }

  _killChild() {
    const child = this.child;
    this.child = null;
    child?.kill("SIGTERM");
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this._killChild();
    if (this.configFile) fs.rmSync(this.configFile, { force: true });
  }
}
