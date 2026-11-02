import { BuilderLeaseControl } from "../builder-lease-control.js";

export async function destroyBuild(worker, job, state) {
  const builder = worker.session();
  if (
    builder.state?.id !== job.buildVmId ||
    builder.state.claimedBy !== job.id ||
    builder.state.name !== state.buildName
  ) {
    const ended = await worker.json(["sandbox", "get", job.buildVmId]);
    if (
      ended.id === job.buildVmId &&
      ended.name === state.buildName &&
      ended.status === "destroyed"
    ) {
      state.buildDestroyed = true;
      worker.save(job, state);
      return true;
    }
    throw Error("Builder ownership changed; no destructive operation.");
  }
  const result = await builder.release(),
    ended = builder.owned(await worker.json(["sandbox", "get", job.buildVmId]));
  if (
    result.providerTerminalStatus !== "destroyed" ||
    ended.status !== "destroyed"
  )
    throw Error("Builder destruction unconfirmed.");
  state.buildDestroyed = true;
  worker.save(job, state);
  try {
    await worker.run(
      "systemctl",
      ["--user", "stop", state.buildCleanupUnit + ".timer"],
      { timeout: 10000 },
    );
  } catch {}
  return true;
}

export async function destroyTest(worker, job, state) {
  const vm = worker.ownTest(
    await worker.json(["sandbox", "get", state.test.id]),
    state.test,
  );
  if (vm.status !== "destroyed")
    await worker.cli(["sandbox", "rm", vm.id, "--force"]);
  const ended = worker.ownTest(
    await worker.json(["sandbox", "get", vm.id]),
    state.test,
  );
  if (ended.status !== "destroyed")
    throw Error("Test destruction unconfirmed.");
  state.test.destroyed = true;
  worker.save(job, state);
  try {
    await worker.run(
      "systemctl",
      ["--user", "stop", state.test.cleanupUnit + ".timer"],
      { timeout: 10000 },
    );
  } catch {}
  return true;
}

export async function cleanupTest(worker, job) {
  const state = worker.journal(job);
  if (!state) return { confirmed: false };
  if (!state.test)
    return { confirmed: true, testVmId: null, testDestroyed: null };
  worker.validateTestJournal(state.test);
  if (!state.test.id) {
    if (state.test.abandoned === true) {
      try {
        await worker.run(
          "systemctl",
          ["--user", "stop", state.test.cleanupUnit + ".timer"],
          { timeout: 10000 },
        );
      } catch {}
      return { confirmed: true, testVmId: null, testDestroyed: null };
    }
    if (state.test.creationRequested === false) return { confirmed: false };
    const matches = (
      await worker.json(["sandbox", "list", "--all", "--limit", "100"])
    ).filter((v) => v.name === state.test.name);
    if (matches.length !== 1) return { confirmed: false };
    state.test.id = matches[0].id;
    worker.ownTest(matches[0], state.test);
    worker.save(job, state);
  }
  await worker.destroyTest(job, state);
  return { confirmed: true, testVmId: state.test.id, testDestroyed: true };
}

export async function cleanup(worker, job) {
  const state = worker.journal(job);
  if (!state) {
    const session = worker.session();
    if (session.state?.id === job.buildVmId) {
      const lease = new BuilderLeaseControl(
          worker.root,
          session.state.name,
        ).deadline(),
        durableClaim =
          lease.lease.requestedAt === session.state.requestedAt &&
          lease.claimedBy === job.id;
      if (session.state.claimedBy === job.id || durableClaim)
        await session.release();
    }
    const ended = await worker.json(["sandbox", "get", job.buildVmId]);
    return {
      confirmed: ended.id === job.buildVmId && ended.status === "destroyed",
      buildVmId: job.buildVmId,
      buildDestroyed: ended.status === "destroyed",
      testVmId: null,
    };
  }
  await worker.destroyBuild(job, state);
  const test = await worker.cleanupTest(job);
  return { ...test, buildVmId: job.buildVmId, buildDestroyed: true };
}
