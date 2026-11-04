import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTwitchMessage } from "../src/chat/twitch.js";
import { kickChatMessage } from "../src/chat/kick-webhook.js";
import { chatPrincipal, cleanDisplayName } from "../src/identity.js";
import { ChatEffects } from "../src/chat-effects.js";
import { ApprovalDelegation } from "../src/approval-delegation.js";
import { CrowdBursts } from "../src/crowd-bursts.js";
import { createChatCommands } from "../src/server/chat-commands.js";

const irc = (tags, login, text = "hi") =>
  parseTwitchMessage(`@${tags} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #owner :${text}`, "owner");

test("Twitch principals use user-id, display-name and room-id tags", () => {
  const viewer = chatPrincipal(irc("user-id=42;room-id=7;display-name=Alice;badges=subscriber/12", "alice"), {
    twitchChannel: "owner",
  });
  assert.equal(viewer.id, "twitch:42");
  assert.equal(viewer.displayName, "Alice");
  assert.deepEqual(viewer.roles, ["viewer"]);
  const mod = chatPrincipal(irc("user-id=43;room-id=7;badges=moderator/1", "helper"), { twitchChannel: "owner" });
  assert.deepEqual(mod.roles, ["moderator"]);
  const owner = chatPrincipal(irc("user-id=7;room-id=7;badges=broadcaster/1", "owner"), { twitchChannel: "owner" });
  assert.deepEqual(owner.roles, ["broadcaster"]);
  // A renamed account keeps its identity.
  assert.equal(chatPrincipal(irc("user-id=42;room-id=7", "alice_new")).id, "twitch:42");
});

test("a login or display name that matches the channel grants nothing when tags say otherwise", () => {
  const impostor = chatPrincipal(irc("user-id=99;room-id=7;display-name=owner", "owner"), { twitchChannel: "owner" });
  assert.equal(impostor.broadcaster, false);
  assert.deepEqual(impostor.roles, ["viewer"]);
  // Untagged fixtures keep the old login comparison (the login comes from IRC).
  assert.equal(chatPrincipal({ source: "twitch", user: "owner" }, { twitchChannel: "owner" }).broadcaster, true);
  // Web and admin chat never carry platform roles, whatever they claim.
  for (const source of ["web", "admin", "local"]) {
    const p = chatPrincipal({ source, user: "owner", isModerator: true, isBroadcaster: true }, { twitchChannel: "owner" });
    assert.equal(p.broadcaster, false);
    assert.equal(p.moderator, false);
    assert.equal(p.id, null);
  }
});

test("Kick principals come from the signed payload", () => {
  const body = (user_id, badges = []) => ({
    broadcaster: { user_id: 123 },
    sender: { user_id, username: "u" + user_id, identity: { badges } },
    content: "hi",
  });
  const viewer = chatPrincipal(kickChatMessage(body(987), { broadcasterUserId: 123 }));
  assert.equal(viewer.id, "kick:987");
  assert.deepEqual(viewer.roles, ["viewer"]);
  assert.deepEqual(chatPrincipal(kickChatMessage(body(5, [{ type: "moderator" }]), { broadcasterUserId: 123 })).roles, [
    "moderator",
  ]);
  assert.deepEqual(chatPrincipal(kickChatMessage(body(123), { broadcasterUserId: 123 })).roles, ["broadcaster"]);
  // Same login on both platforms is two different people.
  assert.notEqual(chatPrincipal({ source: "kick", user: "alice", platformUserId: "1" }).id,
    chatPrincipal({ source: "twitch", user: "alice", platformUserId: "1" }).id);
});

test("display names are normalised and stripped of hidden characters", () => {
  assert.equal(cleanDisplayName("A‮li​ce\u0007"), "Alice");
  assert.equal(cleanDisplayName("ＡＬＩＣＥ"), "ALICE");
  assert.equal(cleanDisplayName("x".repeat(40)).length, 25);
  assert.equal(cleanDisplayName("  two   words "), "two words");
});

test("Kick moderators and broadcasters can pause chat effects; tagged impostors cannot", () => {
  const effects = new ChatEffects({ enabled: true, channel: "owner" });
  assert.equal(effects.command({ source: "kick", user: "mod", isModerator: true }, "!pause").changed, true);
  assert.equal(effects.command({ source: "kick", user: "owner", isBroadcaster: true }, "!resume").changed, true);
  assert.equal(effects.command({ source: "kick", user: "owner" }, "!pause").changed, false);
  assert.equal(effects.command({ source: "twitch", user: "owner", isBroadcaster: false }, "!pause").changed, false);
  assert.equal(effects.command({ source: "twitch", user: "owner" }, "!pause").changed, true);
});

test("delegated approval is matched on the delegating platform", () => {
  const delegation = new ApprovalDelegation({ enabled: true, now: () => 0 });
  delegation.set({ source: "kick", owner: true }, "helper", 60);
  assert.equal(delegation.canApprove({ source: "kick", name: "helper" }, true), true);
  assert.equal(delegation.canApprove({ source: "twitch", name: "helper" }, true), false);
  delegation.set({ source: "twitch", owner: true }, "helper", 60);
  assert.equal(delegation.canApprove({ source: "twitch", name: "helper" }, true), true);
});

test("crowd bursts count distinct people across platforms", () => {
  const bursts = new CrowdBursts({ enabled: true, needed: 2, now: () => 1000 });
  assert.equal(bursts.accept({ source: "twitch", user: "alice", id: "twitch:1" }, "☀"), null);
  // The same Twitch account again is still one person.
  assert.equal(bursts.accept({ source: "twitch", user: "alice_renamed", id: "twitch:1" }, "☀"), null);
  // The same login on Kick is another person, so the burst unlocks.
  assert.deepEqual(bursts.accept({ source: "kick", user: "alice", id: "kick:1" }, "☀"), {
    kind: "sun",
    participants: 2,
  });
  // Browser chat still cannot manufacture viewers.
  assert.equal(bursts.accept({ source: "web", user: "bob" }, "🌧"), null);
});

test("!fallback from Kick needs a moderator or the broadcaster", () => {
  const requested = [];
  const handleChat = createChatCommands({
    TWITCH_CHANNEL: "owner",
    getPublicURL: () => null,
    replies: {},
    chatEffects: new ChatEffects({ enabled: false }),
    feed: () => {},
    requestFallback: (reason) => requested.push(reason),
    remoteGames: { entries: [] },
    ROOT: "/nonexistent",
    host: { error: null, gameDir: "", safeCall: () => false },
  });
  handleChat({ source: "kick", user: "owner", text: "!fallback" });
  handleChat({ source: "web", user: "owner", text: "!fallback" });
  assert.equal(requested.length, 0);
  handleChat({ source: "kick", user: "helper", platformUserId: "5", isModerator: true, text: "!fallback" });
  assert.deepEqual(requested, ["Requested by Kick moderator helper"]);
});
