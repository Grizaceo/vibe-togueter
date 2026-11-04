// Principals: who the controller trusts a chat sender to be. Identity and roles
// come only from the authenticated Twitch IRC socket or a signed Kick webhook;
// a display name never grants anything.
export const CHAT_PLATFORMS = ["twitch", "kick"];

// Control, zero-width and bidi override characters can disguise a name.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;

export function cleanDisplayName(value, max = 25) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(HIDDEN, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// message: what a chat adapter produced ({source, user, platformUserId?,
// displayName?, isModerator?, isBroadcaster?}).
export function chatPrincipal(message, { twitchChannel = "" } = {}) {
  const source = String(message?.source || "");
  const login = String(message?.user || "").toLowerCase();
  const platform = CHAT_PLATFORMS.includes(source) ? source : null;
  const platformId =
    platform && /^\d{1,20}$/.test(String(message.platformUserId || ""))
      ? String(message.platformUserId)
      : null;
  // Twitch messages without tags (old fixtures) keep the login comparison; the
  // login also comes from the authenticated IRC socket. Kick has no such fallback.
  const broadcaster =
    platform !== null &&
    (message.isBroadcaster === true ||
      (message.isBroadcaster === undefined &&
        platform === "twitch" &&
        !platformId &&
        Boolean(twitchChannel) &&
        login === String(twitchChannel).toLowerCase()));
  const moderator = platform !== null && message.isModerator === true;
  return {
    id: platformId ? `${platform}:${platformId}` : null,
    platform,
    platformId,
    login,
    displayName:
      cleanDisplayName(message?.displayName) || cleanDisplayName(message?.user),
    broadcaster,
    moderator,
    roles: broadcaster
      ? ["broadcaster"]
      : moderator
        ? ["moderator"]
        : ["viewer"],
  };
}
