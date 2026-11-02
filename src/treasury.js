// Simulated build-credit ledger; entries do not settle payments or provider bills.
// Append-only records: {at, kind, amountUsd, balance, meta}.

import fs from "node:fs";

export class Treasury {
  constructor(file, { onChange } = {}) {
    this.file = file;
    this.onChange = onChange || (() => {});
    this.balance = 0;
    this.entries = [];
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          this.entries.push(e);
          this.balance = e.balance;
        } catch {}
      }
    }
  }

  _append(entry) {
    this.entries.push(entry);
    fs.appendFileSync(this.file, JSON.stringify(entry) + "\n");
    this.onChange(entry);
  }

  deposit(amountUsd, meta = {}) {
    this.balance = Math.round((this.balance + amountUsd) * 100) / 100;
    this._append({
      at: Date.now(),
      kind: "deposit",
      amountUsd,
      balance: this.balance,
      meta,
    });
  }

  spend(amountUsd, meta = {}) {
    if (amountUsd > this.balance) return false;
    this.balance = Math.round((this.balance - amountUsd) * 100) / 100;
    this._append({
      at: Date.now(),
      kind: "spend",
      amountUsd,
      balance: this.balance,
      meta,
    });
    return true;
  }

  canAfford(amountUsd) {
    return this.balance >= amountUsd;
  }

  stats() {
    const deposits = this.entries.filter((e) => e.kind === "deposit");
    const spends = this.entries.filter((e) => e.kind === "spend");
    return {
      balance: this.balance,
      totalRaised:
        Math.round(deposits.reduce((s, e) => s + e.amountUsd, 0) * 100) / 100,
      totalSpent:
        Math.round(spends.reduce((s, e) => s + e.amountUsd, 0) * 100) / 100,
      gamesGenerated: spends.filter((e) => e.meta?.kind === "game-gen").length,
      lastDeposit: deposits.at(-1) || null,
    };
  }
}
