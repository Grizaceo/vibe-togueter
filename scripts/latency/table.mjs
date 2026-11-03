// Markdown before/after table from benchmark reports produced by bench.mjs.
//   node scripts/latency/table.mjs docs/evidence/latency-baseline.json docs/evidence/latency-a-tick-rate.json ...
import fs from "node:fs";

const reports = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const GAMES = {
  grove: "Grove",
  duel: "Democracy Duel",
  "marble-lobby": "Marble Race (lobby, chat input)",
  "marble-race": "Marble Race (racing)",
};
const SCEN = { clean: "clean", wan: "40±10 ms", lossy: "40±10 ms + 2% stalls" };
const kb = (b) => (b / 1000).toFixed(1);
const lines = [];
for (const scenario of Object.keys(SCEN)) {
  if (!reports.some((r) => r.runs.some((x) => x.scenario === scenario))) continue;
  lines.push(`\n**Network: ${SCEN[scenario]}**\n`);
  lines.push(
    "| Game | Step | Latency p50 / p99 (ms) | Distinct frames/s | Messages/s | KB/s per client | Controller CPU |",
    "|---|---|---:|---:|---:|---:|---:|",
  );
  for (const game of Object.keys(GAMES))
    for (const report of reports) {
      const run = report.runs.find((x) => x.scenario === scenario && x.game === game);
      if (!run) continue;
      const latency =
        run.latencyMs.n > 0
          ? `${run.latencyMs.p50} / ${run.latencyMs.p99} (n=${run.latencyMs.n}${run.latencyMs.timeouts ? `, ${run.latencyMs.timeouts} timeouts` : ""})`
          : "—";
      lines.push(
        `| ${GAMES[game]} | ${report.label} | ${latency} | ${run.perClient.distinctFramesPerSecond} | ${run.perClient.stateMessagesPerSecond} | ${kb(run.perClient.bytesPerSecond)} | ${run.serverCpuPercent}% |`,
      );
    }
}
console.log(lines.join("\n"));
