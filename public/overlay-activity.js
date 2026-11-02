import { communityCreditText } from "./community-credit.js";
// Shared WS snapshots keep the stream summary current without another polling loop.
export function attachActivity(container) {
  let pin;
  return {
    update(state) {
      const next = JSON.stringify(state);
      if (pin === next) return;
      pin = next;
      container.replaceChildren();
      const line = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        container.append(node);
        return node;
      };
      const r = state?.round;
      line(
        "strong",
        r
          ? "Community round · " + r.phase.replaceAll("-", " ")
          : "Community studio",
      );
      if (state?.fallback) line("strong", "Safety fallback: " + state.fallback);
      line(
        "p",
        r
          ? `${r.ideas} idea${r.ideas === 1 ? "" : "s"} · ${r.voters} voter${r.voters === 1 ? "" : "s"}`
          : "Chat: !idea your game idea",
      );
      for (const idea of (r?.highlights || []).slice(
        0,
        state?.prediction ? 1 : 3,
      ))
        line(
          "p",
          `#${idea.id} · ${idea.votes} vote${idea.votes === 1 ? "" : "s"} · ${idea.author}: ${idea.text}`,
        );
      if (r?.credit)
        line(
          "p",
          "Approved input credit · Idea by " +
            r.credit.ideaAuthors.map((a) => a.name).join(", ") +
            " · " +
            communityCreditText(r.credit),
        ).className = "input-credit";
      if (!r) line("p", "Propose → vote → streamer review");
      line("p", state?.builder || "Waiting for controller");
      if (state?.delegation)
        line(
          "p",
          `Round approval: @${state.delegation.name} until ${new Date(state.delegation.expiresAt).toISOString().slice(11, 19)} UTC`,
        );
      if (state?.prediction) {
        const p = state.prediction;
        line("strong", "Free chat prediction · " + p.phase);
        line("p", p.choices.map((c) => `${c.label}: ${c.count}`).join(" · "));
        if (p.phase === "open")
          line("p", "!predict your choice · no points or money");
        if (p.phase === "resolved") {
          line("strong", "Result: " + p.result + " · reported by streamer");
          line(
            "p",
            p.winnerCount +
              " correct: " +
              (p.winners.join(", ") || "No correct predictions"),
          );
        }
      }
      if (state?.crowd?.enabled && !state?.chatEffectsPaused)
        line(
          "p",
          `Grove burst · 3 viewers in 5s: ☀️ ${state.crowd.sun}/${state.crowd.needed} · 🌧️ ${state.crowd.rain}/${state.crowd.needed}`,
        );
      if (state?.chatEffectsPaused)
        line("strong", "Chat effects paused · proposals and votes stay open");
    },
  };
}
