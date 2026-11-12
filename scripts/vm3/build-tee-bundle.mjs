// Builds the teeworlds-rs server for VM3 guests: `git archive <rev>` into a
// temp dir, `cargo build --release -p server` inside rust:1.90-bookworm
// (bookworm glibc 2.36 runs on newer guests), then packs the binary at the
// tar root plus maps/ into runtime/vm3/tee-bundle.tar with a sha256 sidecar
// in tee-bundle.json. Cargo registry/target caches live under
// ~/.cache/va-tee-check/docker-* so repeat builds stay warm.
// Usage: node scripts/vm3/build-tee-bundle.mjs --repo <path> --rev <sha>
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = path.join(os.homedir(), ".cache", "va-tee-check");
const OUT_DIR = path.join(ROOT, "runtime", "vm3");
const BUNDLE = path.join(OUT_DIR, "tee-bundle.tar");
const SIDECAR = path.join(OUT_DIR, "tee-bundle.json");
const IMAGE = "rust:1.90-bookworm";
const DOCKER_TIMEOUT = 3600000;

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
};

async function sh(cmd, args, options = {}) {
  const result = await execute(cmd, args, {
    timeout: DOCKER_TIMEOUT,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return result.stdout;
}

export async function buildTeeBundle({ repo, rev } = {}) {
  if (!repo || !rev) throw Error("build-tee-bundle needs --repo and --rev.");
  if (!fs.existsSync(path.join(repo, ".git")))
    throw Error(`Not a git repository: ${repo}`);
  const sha = (
    await sh("git", ["-C", repo, "rev-parse", `${rev}^{commit}`], {
      timeout: 30000,
    })
  ).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw Error("Could not resolve --rev.");

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "va-tee-bundle-"));
  try {
    const srcDir = path.join(work, "src");
    const stageDir = path.join(work, "stage");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(stageDir, { recursive: true });
    const archive = path.join(work, "src.tar");
    await sh("git", ["-C", repo, "archive", "--format=tar", "-o", archive, sha], {
      timeout: 120000,
    });
    await sh("tar", ["-xf", archive, "-C", srcDir], { timeout: 120000 });

    const cargoCache = path.join(CACHE, "docker-cargo");
    const targetCache = path.join(CACHE, "docker-target");
    fs.mkdirSync(cargoCache, { recursive: true });
    fs.mkdirSync(targetCache, { recursive: true });
    try {
      await sh("docker", ["image", "inspect", IMAGE], { timeout: 30000 });
    } catch {
      await sh("docker", ["pull", IMAGE], { timeout: DOCKER_TIMEOUT });
    }
    await sh(
      "docker",
      [
        "run", "--rm",
        "-v", `${srcDir}:/src`,
        // CARGO_HOME is relocated, not overmounted: the image keeps its
        // rustup proxies in /usr/local/cargo/bin.
        "-e", "CARGO_HOME=/cargo-home",
        "-v", `${cargoCache}:/cargo-home`,
        "-v", `${targetCache}:/target`,
        "-w", "/src",
        IMAGE,
        "cargo", "build", "--release", "-p", "server", "--target-dir", "/target",
      ],
      { timeout: DOCKER_TIMEOUT },
    );
    await sh(
      "docker",
      [
        "run", "--rm",
        "-v", `${targetCache}:/target:ro`,
        "-v", `${srcDir}:/src:ro`,
        "-v", `${stageDir}:/stage`,
        IMAGE,
        "sh", "-c",
        "cp /target/release/teeworlds-rs-server /stage/teeworlds-rs-server && cp -r /src/maps /stage/maps",
      ],
      { timeout: 120000 },
    );

    fs.mkdirSync(OUT_DIR, { recursive: true });
    await sh("tar", ["-cf", BUNDLE, "-C", stageDir, "."], { timeout: 120000 });
    const bytes = fs.statSync(BUNDLE).size;
    const sha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(BUNDLE))
      .digest("hex");
    const sidecar = {
      rev: sha,
      sha256,
      bytes,
      builtAt: new Date().toISOString(),
    };
    fs.writeFileSync(SIDECAR, JSON.stringify(sidecar, null, 2) + "\n");
    return { bundle: BUNDLE, sidecar: SIDECAR, ...sidecar };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildTeeBundle({ repo: arg("repo"), rev: arg("rev") })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error("build-tee-bundle: " + (error?.message || error));
      process.exit(1);
    });
}
