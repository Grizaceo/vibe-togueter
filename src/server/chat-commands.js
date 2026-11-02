import fs from "node:fs";
import path from "node:path";
import { ChatGate } from "../traffic.js";
import { roundApprovalActor } from "../approval-delegation.js";
import { teeEntryURL } from "../tee-join.js";

export function createChatCommands({
  ROOT,
  IDEAS_FILE,
  TWITCH_CHANNEL,
  getPublicURL,
  replies,
  chatEffects,
  crowdBursts,
  teeBridge,
  feed,
  host,
  requestFallback,
  approvalDelegation,
  predictions,
  remoteGames,
  ideaRounds,
  requireNoPendingArtifact,
}) {
  const chatGate = new ChatGate();

  function handleChat({
    user,
    text,
    source,
    messageId,
    participantId,
    isModerator = false,
  }) {
    text = String(text).slice(0, text.startsWith("!idea ") ? 10000 : 200);
    user = String(user).slice(0, 100);
    if (
      source === "twitch" &&
      text.trim() === "!fallback" &&
      (isModerator || user.toLowerCase() === TWITCH_CHANNEL?.toLowerCase())
    ) {
      requestFallback("Requested by Twitch moderator " + user);
      return;
    }
    const control = chatEffects.command({ source, user, isModerator }, text);
    if (control.handled) {
      if (control.changed) {
        if (chatEffects.blocked) {
          crowdBursts.reset();
          teeBridge.pulse = null;
          teeBridge.tick();
        }
        feed(
          "system",
          chatEffects.blocked
            ? "Chat effects paused by " + user
            : "Chat effects resumed by " + user,
        );
      }
      return;
    }
    if (!chatGate.accept(source, participantId || user)) return;
    feed("chat", `${user}: ${text}`);
    if (
      !chatEffects.blocked &&
      !host.error &&
      host.gameDir === path.join(ROOT, "games", "community-grove")
    ) {
      const bonus = crowdBursts.accept({ source, user }, text);
      if (bonus) {
        host.safeCall("onCrowdBonus", bonus);
        feed(
          "system",
          `${bonus.participants} distinct Twitch viewers unlocked a ${bonus.kind} bonus!`,
        );
      }
    }
    if (!text.startsWith("!")) return;
    const [cmd, ...args] = text.slice(1).split(/\s+/);
    // meta commands handled by infra
    if (
      cmd === "join" ||
      cmd === "unirse" ||
      cmd === "entrar" ||
      cmd === "jugar-link"
    ) {
      const teeGame=remoteGames.entries.find(g=>g.adapter==='tee'&&g.joinByDefault===true);
      if(teeGame&&getPublicURL()){
        const entry=teeEntryURL(getPublicURL(),teeGame.id,user);
        if(replies[source])replies[source](`Join with your own tee: ${entry}`);
        else feed('system',`Join with your own tee: ${entry}`);
        return;
      }
      if (getPublicURL() && replies[source]) {
        replies[source](
          `Join the game: ${getPublicURL()}/?name=${encodeURIComponent(user)}`,
        );
      } else if (getPublicURL()) {
        feed(
          "system",
          `Game link: ${getPublicURL()}/?name=${encodeURIComponent(user)}`,
        );
      }
      return;
    }
    const actor = {
      id: participantId || user,
      name: user,
      source,
      owner:
        source === "twitch" &&
        user.toLowerCase() === TWITCH_CHANNEL?.toLowerCase(),
    };
    if (cmd === "delegate") {
      try {
        if (args[0] === "off") approvalDelegation.revoke(actor);
        else approvalDelegation.set(actor, args[0], Number(args[1]) * 60);
        const grant = approvalDelegation.public();
        feed(
          "system",
          grant
            ? "Round input approval delegated to @" +
                grant.name +
                " for " +
                args[1] +
                " minutes."
            : "Round approval delegation revoked.",
        );
      } catch (error) {
        feed("system", user + ": " + error.message);
      }
      return;
    }
    if (cmd === "predict" || cmd === "prediction") {
      try {
        if (cmd === "predict") {
          predictions.vote(actor, args.join(" "));
          feed("system", user + ": prediction saved.");
        } else {
          const action = args.shift();
          if (action === "open")
            predictions.open(actor, args.join(" ").split("|"));
          else if (action === "lock") predictions.lock(actor);
          else if (action === "resolve")
            predictions.resolve(actor, args.join(" "));
          else if (action === "cancel") predictions.cancel(actor);
          else
            throw Error(
              "Use !prediction open choice|choice, lock, resolve choice, or cancel.",
            );
          feed("system", "Chat prediction: " + predictions.public()?.phase);
        }
      } catch (error) {
        feed("system", user + ": " + error.message);
      }
      return;
    }
    if (cmd === "fallback") {
      if (source === "twitch" && (actor.owner || isModerator))
        requestFallback("Requested by Twitch moderator " + user);
      return;
    }
    if (cmd === "tee") {
      const action = args[0] || "status";
      if (action === "on" || action === "off") {
        if (!actor.owner) return;
        if (action === "off") {
          teeBridge.stop();
          feed("system", "Tee chat bridge disabled.");
          return;
        }
        const game = remoteGames.entries.find((g) => g.adapter === "tee");
        if (!game) {
          feed("system", "No Tee runtime configured.");
          return;
        }
        teeBridge
          .start(game, TWITCH_CHANNEL)
          .then(() => {
            feed(
              "system",
              "Tee crowd ready: !tee left|right|jump|hook|fire|stop",
            );
            replies.twitch?.(
              "Tee crowd ready: !tee left|right|jump|hook|fire|stop",
            );
          })
          .catch((error) => feed("system", "Tee bridge: " + error.message));
      } else if (
        !chatEffects.blocked &&
        teeBridge.command(action, { source, user })
      )
        feed("system", `${user}: Tee ${action}`);
      return;
    }
    if (["idea", "vote", "build"].includes(cmd)) {
      try {
        if (cmd === "idea") {
          const result = ideaRounds.propose(actor, args.join(" "), messageId);
          if (!result.duplicate) {
            const idea = result.round.ideas.find((i) => i.id === result.ideaId);
            fs.appendFileSync(
              IDEAS_FILE,
              JSON.stringify({
                user,
                idea: idea.text,
                source,
                at: Date.now(),
                roundId: result.round.id,
                ideaId: idea.id,
              }) + "\n",
            );
            feed(
              "system",
              `Idea saved: #${idea.id} by ${user}. ${result.round.ideas.length}/${result.round.settings.maxIdeas}.`,
            );
          }
        } else if (cmd === "vote") {
          ideaRounds.vote(actor, Number(args[0]), messageId);
          feed("system", `${user}: ballot updated.`);
        } else {
          const action = args[0] || "status";
          if (action === "open") {
            requireNoPendingArtifact();
            ideaRounds.open(actor);
          } else if (action === "vote") ideaRounds.startVoting(actor);
          else if (action === "close") ideaRounds.finishVoting(actor);
          else if (action === "choose")
            ideaRounds.select(actor, args.slice(1).map(Number));
          else if (action === "approve")
            ideaRounds.approve(
              roundApprovalActor(actor, isModerator, approvalDelegation),
              { roundId: ideaRounds.current()?.id, reviewToken: args[1] },
            );
          else if (action === "cancel") ideaRounds.cancel(actor);
          else if (action !== "status")
            throw new Error(
              "Use !build open|vote|close|choose IDs|approve|cancel|status.",
            );
          const round = ideaRounds.public();
          const state = round
            ? `${round.phase}: ${round.ideas.length} ideas, ${round.voters} voters`
            : "no round";
          const review = round?.reviewToken
            ? " · approval token " + round.reviewToken
            : "";
          feed("system", "Build round " + state + review);
          if (replies[source]) replies[source]("Build round " + state + review);
        }
      } catch (error) {
        feed("system", `${user}: ${error.message}`);
        if (replies[source]) replies[source](error.message);
      }
      return;
    }
    if (chatEffects.blocked) return;
    const handled = host.safeCall("onChat", { name: user, source }, cmd, args);
    if (handled) feed("system", `${user} used !${cmd}`);
  }

  return handleChat;
}
