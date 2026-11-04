// Session-only, no points, money, Twitch Predictions API or payout ledger.
const active = (p) => p && ["open", "locked"].includes(p.phase);
const normalize = (s) => String(s).normalize("NFKC").trim().toLowerCase();
export class ChatPredictions {
  constructor({ enabled = false, now = Date.now } = {}) {
    this.enabled = enabled === true;
    this.now = now;
    this.current = null;
  }
  owner(actor) {
    if (
      actor?.owner !== true ||
      !["twitch", "kick", "streamer-ui"].includes(actor.source)
    )
      throw Error("Only the streamer controls predictions.");
  }
  tick() {
    const p = this.current;
    if (p?.phase === "open" && this.now() >= p.closesAt) p.phase = "locked";
  }
  open(actor, choices) {
    this.owner(actor);
    if (!this.enabled) throw Error("Chat predictions are disabled.");
    this.tick();
    if (active(this.current))
      throw Error("Resolve or cancel the current prediction first.");
    if (
      !Array.isArray(choices) ||
      choices.length < 2 ||
      choices.length > 6 ||
      choices.some(
        (s) =>
          typeof s !== "string" ||
          !s.trim() ||
          s.length > 32 ||
          /[\x00-\x1f]/.test(s),
      ) ||
      new Set(choices.map(normalize)).size !== choices.length
    )
      throw Error("Supply 2–6 distinct choices, up to 32 characters each.");
    this.current = {
      phase: "open",
      choices: choices.map((s) => s.trim()),
      ballots: new Map(),
      closesAt: this.now() + 60000,
    };
    return this.public();
  }
  vote(actor, choice) {
    if (!this.enabled) throw Error("Chat predictions are disabled.");
    this.tick();
    const p = this.current;
    if (p?.phase !== "open") throw Error("No prediction is open.");
    const index = p.choices.findIndex(
      (s) => normalize(s) === normalize(choice),
    );
    if (index < 0) throw Error("Predict one of: " + p.choices.join(" | "));
    if (!actor?.source || !actor.name)
      throw Error("Join chat before predicting.");
    const id = JSON.stringify([
      actor.source,
      actor.id || actor.name.toLowerCase(),
    ]);
    if (!p.ballots.has(id) && p.ballots.size >= 5000)
      throw Error("Prediction capacity reached.");
    p.ballots.set(id, {
      index,
      name: String(actor.name).slice(0, 50),
      source: actor.source,
    });
    return this.public();
  }
  lock(actor) {
    this.owner(actor);
    this.tick();
    if (this.current?.phase !== "open")
      throw Error("No open prediction to lock.");
    this.current.phase = "locked";
    return this.public();
  }
  resolve(actor, choice) {
    this.owner(actor);
    this.tick();
    const p = this.current;
    if (p?.phase !== "locked")
      throw Error("Lock the prediction before resolving it.");
    const index = p.choices.findIndex(
      (s) => normalize(s) === normalize(choice),
    );
    if (index < 0) throw Error("Resolve to an existing choice.");
    p.result = index;
    p.phase = "resolved";
    return this.public();
  }
  cancel(actor) {
    this.owner(actor);
    if (!active(this.current)) throw Error("No active prediction.");
    this.current.phase = "cancelled";
    return this.public();
  }
  public() {
    if (!this.enabled) return null;
    this.tick();
    const p = this.current;
    if (!p) return null;
    const counts = p.choices.map(() => 0),
      winners = [];
    for (const vote of p.ballots.values()) {
      counts[vote.index]++;
      if (p.phase === "resolved" && vote.index === p.result)
        winners.push(
          vote.source === "twitch"
            ? vote.name
            : vote.name + " (" + vote.source + ")",
        );
    }
    return {
      phase: p.phase,
      closesAt: p.closesAt,
      choices: p.choices.map((label, id) => ({ label, count: counts[id] })),
      participants: p.ballots.size,
      result: p.result === undefined ? null : p.choices[p.result],
      winnerCount: winners.length,
      winners: winners.slice(0, 6),
      resolution: "streamer-reported",
    };
  }
}
