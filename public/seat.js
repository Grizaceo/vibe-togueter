// Seat pairing on the browser side (docs/platform/IDENTITY_SEATS.md §5.1).
// Each tab owns an ECDSA P-256 key whose private half cannot be exported, not
// even by this script. Seat tokens are bound to it, and every connection signs
// the server's challenge, so a leaked token is useless in another browser.
const DB = "va-seat",
  STORE = "keys";

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function tokenId(token) {
  try {
    const body = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(body)).jti || null;
  } catch {
    return null;
  }
}

function session(storage = globalThis.sessionStorage) {
  return {
    get: (k) => {
      try {
        return storage?.getItem(k) || null;
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        v === null ? storage?.removeItem(k) : storage?.setItem(k, v);
      } catch {}
    },
  };
}

function openDb(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function dbGet(db, key) {
  return new Promise((resolve) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}
function dbPut(db, key, value) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

// Returns {jwk, sign(message)} or null where WebCrypto is unavailable
// (plain http on a LAN). The key pair survives reloads of this tab only.
export async function tabKey({
  subtle = globalThis.crypto?.subtle,
  indexedDB = globalThis.indexedDB,
  storage,
} = {}) {
  if (!subtle) return null;
  const s = session(storage);
  let tab = s.get("va-seat-tab");
  if (!tab) {
    tab = b64url(globalThis.crypto.getRandomValues(new Uint8Array(12)));
    s.set("va-seat-tab", tab);
  }
  let pair = null,
    db = null;
  try {
    db = indexedDB ? await openDb(indexedDB) : null;
    pair = db ? await dbGet(db, tab) : null;
  } catch {}
  if (!pair) {
    pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
      "verify",
    ]);
    if (db) await dbPut(db, tab, pair);
  }
  const full = await subtle.exportKey("jwk", pair.publicKey);
  return {
    jwk: { kty: full.kty, crv: full.crv, x: full.x, y: full.y },
    sign: async (message) =>
      b64url(
        await subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          pair.privateKey,
          new TextEncoder().encode(message),
        ),
      ),
  };
}

// Drives the seat handshake over an open room socket.
// onSeat({identity}) when seated, onSeat({identity: null, reason}) otherwise;
// onCode({code, ttlMs}) / onError(reason) for the pairing panel.
export function createSeatClient({ send, keyPromise, storage, onSeat, onCode, onError }) {
  const s = session(storage);
  let challenge = null,
    room = null;
  const keyReady = keyPromise.catch(() => null);

  async function hello(token) {
    const key = await keyReady;
    const jti = tokenId(token);
    const proof =
      key && jti ? { jwk: key.jwk, signature: await key.sign(`${challenge}|${room}|${jti}`) } : null;
    send({ t: "hello", seat: token, ...(proof ? { proof } : {}) });
  }

  return {
    async handle(msg) {
      if (msg.t === "challenge") {
        challenge = msg.n;
        room = msg.room;
        const resume = s.get("va-seat-resume");
        if (resume) await hello(resume);
        else onSeat?.({ identity: null, reason: "new" });
        return true;
      }
      if (msg.t === "seat-offer") {
        challenge = msg.challenge || challenge;
        await hello(msg.token);
        return true;
      }
      if (msg.t === "seat") {
        if (msg.ok) {
          s.set("va-seat-resume", msg.resume);
          onSeat?.({ identity: msg.identity });
        } else {
          s.set("va-seat-resume", null);
          if (msg.challenge) challenge = msg.challenge;
          onSeat?.({ identity: null, reason: msg.revoked || msg.reason });
        }
        return true;
      }
      if (msg.t === "pair" || msg.t === "guest") {
        if (msg.ok && msg.code) onCode?.({ code: msg.code, ttlMs: msg.ttlMs });
        else if (!msg.ok) onError?.(msg.reason);
        return true;
      }
      return false;
    },
    async requestCode() {
      const key = await keyReady;
      send({ t: "pair", ...(key ? { jwk: key.jwk } : {}) });
    },
    async guest(name) {
      const key = await keyReady;
      send({ t: "guest", name, ...(key ? { jwk: key.jwk } : {}) });
    },
    notMe() {
      s.set("va-seat-resume", null);
      send({ t: "unseat" });
    },
  };
}
