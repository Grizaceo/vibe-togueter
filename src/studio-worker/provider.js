import { execFile } from "node:child_process";
import { promisify } from "node:util";
export const execute = promisify(execFile);
export const STUDIO_MODEL = "gpt-6.1-terra";
const processId = (id) =>
  typeof id === "string" && /^proc_[a-zA-Z0-9_-]{1,150}$/.test(id);
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const done = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      },
      timer = setTimeout(done, ms),
      abort = () => {
        clearTimeout(timer);
        reject(Error("Operation interrupted"));
      };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });

export async function providerCli(
  worker,
  args,
  { signal, timeout = 30000 } = {},
) {
  try {
    const result = await worker.run("createos", args, {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      signal,
    });
    return result.stdout;
  } catch {
    throw Error(
      "CreateOS observation or operation failed; preserve the exact VM/process identity for reconciliation.",
    );
  }
}

export async function providerJson(worker, args, options) {
  return JSON.parse(await worker.cli(args, options));
}

export async function managedProcess(
  worker,
  vm,
  command,
  job,
  state,
  field,
  { signal, maxMs },
) {
  signal?.throwIfAborted();
  // Codex appends piped stdin even with an explicit prompt. Managed pipes stay open; close fd 0 in the guest.
  // Creation is never retried after an observation failure.
  const created = await worker.json(
    [
      "sandbox",
      "process",
      "start",
      vm,
      "--",
      "bash",
      "-c",
      "exec < /dev/null; " + command,
    ],
    { signal },
  );
  if (!processId(created.process_id))
    throw Error("Managed process identity missing; reconcile the VM.");
  state[field] = { id: created.process_id, startedAt: worker.now() };
  worker.save(job, state);
  const end = worker.now() + maxMs;
  while (worker.now() < end) {
    signal?.throwIfAborted();
    let observed;
    try {
      observed = await worker.json(
        ["sandbox", "process", "get", vm, created.process_id],
        { signal },
      );
    } catch {
      if (signal?.aborted) throw Error("Cancelled");
      await sleep(500, signal);
      continue;
    }
    if (observed.process_id !== created.process_id)
      throw Error("Managed process identity mismatch.");
    if (
      ["exited", "failed"].includes(observed.state) &&
      observed.tree_exited === true
    ) {
      state[field].terminal = {
        state: observed.state,
        exitCode: observed.exit_code,
      };
      worker.save(job, state);
      if (observed.state !== "exited" || observed.exit_code !== 0)
        throw Error("Guest process did not complete successfully.");
      return;
    }
    await sleep(500, signal);
  }
  throw Error(
    "Guest deadline reached; destroy the exact VM instead of restarting.",
  );
}
