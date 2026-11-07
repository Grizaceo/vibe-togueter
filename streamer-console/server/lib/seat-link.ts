import { fail } from "@agent-native/core/action";
import crypto from "node:crypto";
import { eq, ne, and } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { isoNow } from "../db/timestamps.js";
import { wsUrl } from "./arena.js";
import { decodeSeatToken, jwkThumbprint, validSeatOffer } from "./rules.js";

// Viewer identity linking reuses the controller's own seat pairing: this
// server opens a pending ?seat=1 socket, shows the pairing code, and the
// viewer types "!join CODE" in Twitch/Kick chat. The socket is NEVER seated:
// we never send hello and never redeem the offer token, so the controller
// runs no onJoin, grants no gameplay seat, and never replaces the viewer's
// real game tab. The token is decoded for its claims only — never stored,
// logged, returned or redeemed.
type Link = { platform: string; displayName: string; linkedAt: string };
type Pending = {
  ws: WebSocket;
  code: string | null;
  expiresAt: number;
  status: "pending" | "linked" | "expired" | "failed";
  reason?: string;
  link?: Link;
  timer: ReturnType<typeof setTimeout> | null;
};

const MAX_PENDING = 20;
const pendings = new Map<string, Pending>();

function prune() {
  const now = Date.now();
  for (const [email, p] of pendings)
    if (
      (p.status === "expired" || p.status === "failed") &&
      p.expiresAt + 60000 < now
    )
      pendings.delete(email);
}

function settle(p: Pending, status: Pending["status"], reason?: string) {
  if (p.status !== "pending") return;
  p.status = status;
  if (reason) p.reason = reason;
  if (p.timer) clearTimeout(p.timer);
  try {
    p.ws.close();
  } catch {}
}

export function startIdentityLink(email: string) {
  prune();
  const existing = pendings.get(email);
  if (
    existing &&
    existing.status === "pending" &&
    existing.code &&
    existing.expiresAt > Date.now()
  )
    return { code: existing.code, expiresAt: existing.expiresAt };
  if (existing) settle(existing, "expired");

  if (
    [...pendings.values()].filter((p) => p.status === "pending").length >=
    MAX_PENDING
  )
    fail("Too many pairings in progress; try again shortly.", {
      errorCode: "pairing_capacity",
      statusCode: 429,
    });

  // The pair key binds the code to this server: the controller only offers
  // the seat to whoever controls this exact key (cnf.jkt in the claims).
  const { publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const jwk = publicKey.export({ format: "jwk" }) as {
    kty: string;
    crv: string;
    x: string;
    y: string;
  };
  const jkt = jwkThumbprint(jwk);
  if (!jkt)
    fail("This server cannot create a seat pairing key.", {
      errorCode: "pairing_unavailable",
      statusCode: 503,
    });

  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl() + "/play?seat=1&frames=none");
  } catch {
    fail("Vibe Arena controller unreachable.", {
      errorCode: "controller_unavailable",
      statusCode: 503,
    });
  }
  const pending: Pending = {
    ws: ws!,
    code: null,
    expiresAt: Date.now() + 60000,
    status: "pending",
    timer: null,
  };

  const opened = new Promise<{ code: string; expiresAt: number }>(
    (resolve, reject) => {
      ws.addEventListener("message", (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (msg.t === "challenge") {
          ws.send(JSON.stringify({ t: "pair", jwk }));
        } else if (msg.t === "pair" && msg.ok === true) {
          pending.code = String(msg.code);
          pending.expiresAt = Date.now() + Number(msg.ttlMs || 0);
          pending.timer = setTimeout(
            () => settle(pending, "expired"),
            Math.max(1000, Number(msg.ttlMs || 0) + 2000),
          );
          pendings.set(email, pending);
          resolve({ code: pending.code, expiresAt: pending.expiresAt });
        } else if (msg.t === "pair" && msg.ok === false) {
          settle(pending, "failed", String(msg.reason || "Pairing refused."));
          reject(Object.assign(new Error(pending.reason), { pairing: true }));
        } else if (msg.t === "seat-offer") {
          void linkFromOffer(email, pending, String(msg.token || ""), jkt);
        }
      });
      ws.addEventListener("error", () => {
        settle(pending, "failed", "Pairing connection failed.");
        reject(Object.assign(new Error("controller_unavailable"), { pairing: true }));
      });
      ws.addEventListener("close", () => {
        if (pending.status === "pending" && pending.code)
          settle(pending, "failed", "Pairing connection closed.");
        else if (pending.status === "pending")
          reject(
            Object.assign(new Error("Pairing connection closed."), {
              pairing: true,
            }),
          );
      });
    },
  );
  return opened.catch((error) => {
    pendings.set(email, pending);
    fail(
      error?.pairing && error.message !== "controller_unavailable"
        ? String(error.message).slice(0, 200)
        : "Vibe Arena controller unreachable.",
      {
        errorCode:
          error?.pairing && error.message !== "controller_unavailable"
            ? "pairing_rejected"
            : "controller_unavailable",
        statusCode: error?.pairing ? 409 : 503,
      },
    );
  });
}

async function linkFromOffer(
  email: string,
  pending: Pending,
  token: string,
  jkt: string,
) {
  try {
    const offer = validSeatOffer(decodeSeatToken(token), jkt, Date.now());
    if (!offer) {
      settle(pending, "failed", "The seat offer could not be validated.");
      return;
    }
    const linkedAt = isoNow();
    await getDb().transaction(async (tx) => {
      // A platform identity belongs to one console account: re-linking moves it.
      await tx
        .delete(schema.viewerLinks)
        .where(
          and(
            eq(schema.viewerLinks.sub, offer.sub),
            ne(schema.viewerLinks.ownerEmail, email),
          ),
        );
      await tx
        .insert(schema.viewerLinks)
        .values({
          ownerEmail: email,
          sub: offer.sub,
          platform: offer.platform,
          displayName: offer.name,
          roles: JSON.stringify(offer.roles),
          linkedAt,
        })
        .onConflictDoUpdate({
          target: schema.viewerLinks.ownerEmail,
          set: {
            sub: offer.sub,
            platform: offer.platform,
            displayName: offer.name,
            roles: JSON.stringify(offer.roles),
            linkedAt,
          },
        });
    });
    pending.link = {
      platform: offer.platform,
      displayName: offer.name,
      linkedAt,
    };
    settle(pending, "linked");
  } catch {
    settle(pending, "failed", "The identity link could not be saved.");
  }
}

export function identityLinkStatus(email: string) {
  prune();
  const pending = pendings.get(email);
  return pending ?? null;
}
