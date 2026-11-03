// Runtime adapters for pre-existing remote games. This never provisions or runs code.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export class RemoteGames {
  constructor(entries, file, { fetchImpl = fetch } = {}) {
    this.entries = (entries || []).map((entry) => {
      const url = new URL(entry.baseURL);
      if (
        !/^[a-z0-9-]{1,60}$/.test(entry.id) ||
        !["t99", "tee"].includes(entry.adapter) ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw Error("Invalid remote game configuration.");
      return { ...entry, baseURL: url.origin };
    });
    if (new Set(this.entries.map((e) => e.id)).size !== this.entries.length)
      throw Error("Duplicate remote game ID.");
    if(this.entries.filter(e=>e.joinByDefault===true).length>1||this.entries.some(e=>e.joinByDefault!==undefined&&(typeof e.joinByDefault!=='boolean'||e.adapter!=='tee')))
      throw Error('Select at most one Tee game for individual join.');
    this.file = file;
    this.fetch = fetchImpl;
    this.data = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : { version: 1, sessions: [] };
    if (this.data.version !== 1 || !Array.isArray(this.data.sessions))
      throw Error("Invalid remote session store.");
    this.busy = new Set();
    this.health = new Map();
    if (
      this.data.sessions.some((s) => ["creating", "starting"].includes(s.state))
    ) {
      const next = structuredClone(this.data);
      for (const s of next.sessions)
        if (["creating", "starting"].includes(s.state))
          s.state = "reconcile-required";
      this.save(next);
    }
  }
  save(next) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + "." + crypto.randomUUID() + ".tmp";
    let fd;
    try {
      fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify(next) + "\n");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, this.file);
      this.data = next;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  update(id, patch) {
    const next = structuredClone(this.data),
      s = next.sessions.find((s) => s.id === id);
    if (!s) throw Error("Unknown session.");
    Object.assign(s, patch, { updatedAt: Date.now() });
    this.save(next);
    return structuredClone(s);
  }
  entry(id) {
    const game = this.entries.find((e) => e.id === id);
    if (!game) throw Error("Unknown remote game.");
    return game;
  }
  catalog() {
    return {
      games: this.entries.map((e) => ({
        ...e,
        health: this.health.get(e.id) || null,
        chatControl: e.adapter === "tee",
      })),
      sessions: structuredClone(this.data.sessions).slice(-30),
      notice:
        "External demo runtimes are public. Room codes and local owner controls are not access control on their backend.",
    };
  }
  async request(game, endpoint, method = "GET") {
    const response = await this.fetch(game.baseURL + endpoint, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    });
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 262144) throw Error("Remote response too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (!response.ok)
      throw Error("Remote runtime rejected request (" + response.status + ").");
    return body;
  }
  async inspect(gameId) {
    const game = this.entry(gameId);
    const body = await this.request(
      game,
      game.adapter === "t99" ? "/api/rooms" : "/healthz",
    );
    if (game.adapter === "t99") {
      if (
        body?.ok !== true ||
        !Array.isArray(body.list) ||
        body.list.some(
          (r) =>
            typeof r?.code !== "string" ||
            typeof r.started !== "boolean" ||
            !Number.isSafeInteger(r.humans) ||
            r.humans < 0 ||
            r.humans > 99,
        )
      )
        throw Error("Invalid room status from remote runtime.");
    } else if (body?.data?.up !== true)
      throw Error("Remote runtime is not healthy.");
    this.health.set(game.id, {
      checkedAt: Date.now(),
      ok: true,
      details: body,
    });
    return this.health.get(game.id);
  }
  async create(gameId, requestId, channel = "") {
    const game = this.entry(gameId);
    if (game.adapter !== "t99")
      throw Error("This runtime has no room-creation adapter.");
    if (
      typeof requestId !== "string" ||
      !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)
    )
      throw Error("Provide a stable request ID.");
    const existing = this.data.sessions.find((s) => s.requestId === requestId);
    if (existing) {
      if (existing.gameId !== gameId)
        throw Error("Request ID already belongs to another game.");
      return structuredClone(existing);
    }
    if (this.data.sessions.length >= 1000)
      throw Error("Session journal full; archive it explicitly.");
    // t99 protocol MAX_ROOM=8; a longer value is silently truncated upstream.
    const code = "VA" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const url = new URL(game.baseURL);
    url.search = new URLSearchParams({
      mode: "online",
      room: code,
      channel,
      server: game.baseURL.replace("https:", "wss:") + "/ws",
    }).toString();
    const session = {
      id: crypto.randomUUID(),
      requestId,
      gameId,
      code,
      joinURL: url.toString(),
      state: "creating",
      visibility: "public",
      createdAt: Date.now(),
    };
    const next = structuredClone(this.data);
    next.sessions.push(session);
    this.save(next);
    this.busy.add(session.id);
    try {
      const result = await this.request(
        game,
        "/api/rooms?code=" + code,
        "POST",
      );
      if (result.code !== code) throw Error("Room identity mismatch.");
      return this.update(session.id, { state: "lobby" });
    } catch (error) {
      this.update(session.id, { state: "reconcile-required" });
      throw error;
    } finally {
      this.busy.delete(session.id);
    }
  }
  async start(sessionId) {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) throw Error("Unknown session.");
    if (session.state === "started") return structuredClone(session);
    if (session.state !== "lobby" || this.busy.has(session.id))
      throw Error("Session needs reconciliation or is busy.");
    this.busy.add(session.id);
    try {
      const game = this.entry(session.gameId),
        status = await this.inspect(game.id);
      const room = status.details.list?.find((r) => r.code === session.code);
      if (!room || room.humans < 1)
        throw Error(
          "At least one player must join this lobby before starting.",
        );
      this.update(session.id, { state: "starting" });
      try {
        const result = await this.request(
          game,
          "/api/rooms/" + session.code + "/start",
          "POST",
        );
        if (result.started !== true) throw Error("Start was not confirmed.");
        return this.update(session.id, { state: "started" });
      } catch (error) {
        this.update(session.id, { state: "reconcile-required" });
        throw error;
      }
    } finally {
      this.busy.delete(session.id);
    }
  }
  async reconcile(sessionId) {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session || this.busy.has(sessionId))
      throw Error("Unknown or busy session.");
    this.busy.add(sessionId);
    try {
      const status = await this.inspect(session.gameId);
      const room = status.details.list?.find((r) => r.code === session.code);
      return this.update(sessionId, {
        state: room ? (room.started ? "started" : "lobby") : "missing",
      });
    } finally {
      this.busy.delete(sessionId);
    }
  }
}
