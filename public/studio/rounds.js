import {
  $,
  state,
  socket,
  reviewed,
  el,
  message,
  send,
  setSocket,
} from "./shared.js";
import { communityCreditText } from "../community-credit.js";
import { renderCreatorCredits } from "../credits.js";
import { renderWorker } from "./worker.js";

export function updateWords() {
  const words = $("proposal").value.trim().split(/\s+/u).filter(Boolean).length;
  $("words").textContent =
    `${words} / ${state?.round?.settings.maxWords || 100} words`;
}
export function renderRound() {
  if (!state) return;
  const r = state.round;
  $("community-credit").textContent =
    state.features?.communityCredit && r?.credit
      ? "Approved input credit · " + communityCreditText(r.credit)
      : "";
  $("channel").textContent =
    (state.channel ? "#" + state.channel + " · " : "") +
    (state.twitchConnected ? "Twitch connected" : "web studio");
  $("execution").textContent =
    state.build.mode === "cloud-vm"
      ? state.build.enabled
        ? "Construction: experimental isolated worker " +
          (state.build.workerConnected
            ? "ready."
            : "configured; owner preflight required.")
        : "Studio builder: off in this public demo — enabled per approved run with a fresh private login."
      : "Construction: explicitly trusted local agent mode.";
  renderWorker();
  $("phase").textContent = r?.phase || "First proposal opens a round";
  $("delegate-message").textContent = state.delegation
    ? "Input approvals delegated to @" +
      state.delegation.name +
      " until " +
      new Date(state.delegation.expiresAt).toISOString().slice(11, 19) +
      " UTC"
    : "No active approval delegate.";
  $("round-info").textContent = r
    ? `Proposals: ${r.ideas.length}/${r.settings.maxIdeas} · ${r.voters} voting session${r.voters === 1 ? "" : "s"} · ${r.settings.winnerCount} selection slot${r.settings.winnerCount === 1 ? "" : "s"}${r.phase === "voting" ? " · " + Math.max(0, Math.ceil((r.voteEndsAt - Date.now()) / 1000)) + "s left" : ""}`
    : "The streamer controls later rounds and every build approval.";
  $("ideas").replaceChildren();
  for (const idea of r?.ideas || []) {
    const card = el("article", undefined, "card");
    card.append(
      el("span", `#${idea.id} · ${idea.author} (${idea.source})`, "tiny muted"),
      el("p", idea.text),
      el("strong", `${idea.votes} vote${idea.votes === 1 ? "" : "s"}`),
    );
    const button = el("button", "Vote #" + idea.id);
    button.disabled = r.phase !== "voting" || socket?.readyState !== 1;
    button.onclick = () => send("!vote " + idea.id);
    const actions = el("div", undefined, "actions");
    actions.append(button);
    card.append(actions);
    if (r.selected.includes(idea.id))
      card.append(el("p", "Selected for streamer review", "success tiny"));
    $("ideas").append(card);
  }
  if (!r?.ideas.length)
    $("ideas").append(
      el(
        "div",
        "Bring a game idea. The first arriving proposals fill the round.",
        "empty",
      ),
    );
  $("propose").disabled =
    socket?.readyState !== 1 || !!(r && r.phase !== "collecting");
  updateWords();
  $("credits-preview").hidden = !r?.resourceManifest?.assets.length;
  renderCreatorCredits($("credits"), r?.resourceManifest);
  $("approve-selection").disabled =
    !reviewed ||
    reviewed.roundId !== r?.id ||
    reviewed.reviewToken !== r?.reviewToken ||
    r?.phase !== "awaiting-approval";
}

export function initConversation() {
  $("connect").onclick = () => {
    socket?.close();
    setSocket(
      new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/spectate?name=${encodeURIComponent($("alias").value || "viewer")}`,
      ),
    );
    socket.onopen = () => {
      $("web-status").textContent = "Connected as a web session";
      renderRound();
    };
    socket.onclose = () => {
      $("web-status").textContent = "Disconnected";
      if (state) renderRound();
    };
    socket.onerror = () =>
      message("web-status", "Conversation connection failed.");
    socket.onmessage = (event) => {
      const value = JSON.parse(event.data);
      if (value.t === "feed" && value.kind === "system")
        $("round-message").textContent = value.text;
    };
  };
  $("proposal").oninput = updateWords;
  $("idea-form").onsubmit = (event) => {
    event.preventDefault();
    send("!idea " + $("proposal").value);
  };
}
