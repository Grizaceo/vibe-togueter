// Userspace network impairment for latency benchmarks (no root, no tc/netem).
// Each TCP chunk is delayed by delayMs ± jitterMs, kept in order (TCP never
// reorders for the application). Packet loss is modelled as what TCP turns it
// into: with probability `loss` a chunk, and everything queued behind it,
// waits an extra retransmission timeout (rtoMs, default Linux RTO_min 200 ms).
// This is an approximation at chunk granularity, not real congestion control.
import net from "node:net";
import { performance } from "node:perf_hooks";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function delayedPipe(from, to, { delayMs, jitterMs, loss, rtoMs }, rand) {
  const queue = [];
  let last = 0,
    timer = null;
  const flush = () => {
    timer = null;
    const now = performance.now();
    while (queue.length && queue[0].at <= now + 0.5)
      to.write(queue.shift().chunk);
    if (queue.length) arm();
  };
  const arm = () => {
    if (timer) return;
    timer = setTimeout(flush, Math.max(0, queue[0].at - performance.now()));
  };
  from.on("data", (chunk) => {
    if (!delayMs && !jitterMs && !loss) return to.write(chunk);
    let at = performance.now() + delayMs + (rand() * 2 - 1) * jitterMs;
    if (loss && rand() < loss) at += rtoMs;
    at = Math.max(at, last);
    last = at;
    queue.push({ at, chunk });
    arm();
  });
  from.on("end", () => {
    const end = () => (queue.length ? setTimeout(end, 5) : to.end());
    end();
  });
}

export async function startProxy({
  targetPort,
  delayMs = 0,
  jitterMs = 0,
  loss = 0,
  rtoMs = 200,
  seed = 1,
}) {
  const rand = mulberry32(seed);
  const sockets = new Set();
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, "127.0.0.1");
    for (const s of [client, upstream]) {
      s.setNoDelay(true);
      sockets.add(s);
      s.on("error", () => {
        client.destroy();
        upstream.destroy();
      });
      s.on("close", () => sockets.delete(s));
    }
    const options = { delayMs, jitterMs, loss, rtoMs };
    delayedPipe(client, upstream, options, rand);
    delayedPipe(upstream, client, options, rand);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: server.address().port,
    close() {
      for (const s of sockets) s.destroy();
      return new Promise((r) => server.close(r));
    },
  };
}
