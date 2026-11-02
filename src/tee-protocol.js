// Narrow postcard codec pinned to teeworlds-rs crates/shared/src/{proto,input}.rs.
// Wire reference: https://postcard.jamesmunns.com/wire-format.html
const uint = (n) => {
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error("Invalid unsigned integer.");
  const out = [];
  do {
    const low = n % 128;
    n = Math.floor(n / 128);
    out.push(low | (n ? 128 : 0));
  } while (n);
  return Buffer.from(out);
};
export function teeJoin(name) {
  const bytes = Buffer.from(name);
  if (bytes.length > 64) throw Error("Player name too long.");
  return Buffer.concat([uint(0), uint(bytes.length), bytes]);
}
export function teeInput(
  seq,
  {
    dir = 0,
    jump = false,
    hook = false,
    fire = false,
    aimX = 1,
    aimY = 0,
    weapon = 0,
  } = {},
) {
  if (
    ![-1, 0, 1].includes(dir) ||
    ![jump, hook, fire].every((v) => typeof v === "boolean") ||
    ![aimX, aimY].every(Number.isFinite) ||
    !Number.isInteger(weapon) ||
    weapon < 0 ||
    weapon > 5
  )
    throw Error("Invalid bounded input.");
  const floats = Buffer.alloc(8);
  floats.writeFloatLE(aimX, 0);
  floats.writeFloatLE(aimY, 4);
  return Buffer.concat([
    uint(1),
    uint(seq),
    Buffer.from([dir & 255, +jump, +hook, +fire]),
    floats,
    Buffer.from([weapon]),
  ]);
}
export function teeServerMessage(bytes) {
  const b = Buffer.from(bytes);
  let offset = 0;
  const byte = () => {
    if (offset >= b.length) throw Error("Truncated frame.");
    return b[offset++];
  };
  const number = () => {
    let n = 0,
      m = 1;
    for (let i = 0; i < 8; i++) {
      const v = byte();
      n += (v & 127) * m;
      if (!Number.isSafeInteger(n)) throw Error("Integer overflow.");
      if (!(v & 128)) return n;
      m *= 128;
    }
    throw Error("Varint too long.");
  };
  const signed = () => {
    const n = number();
    return n % 2 ? -(n + 1) / 2 : n / 2;
  };
  const boolean = () => {
    const n = byte();
    if (n > 1) throw Error("Invalid boolean.");
    return !!n;
  };
  const float = () => {
    if (offset + 4 > b.length) throw Error("Truncated float.");
    const v = b.readFloatLE(offset);
    offset += 4;
    if (!Number.isFinite(v)) throw Error("Non-finite coordinate.");
    return v;
  };
  const vector = () => ({ x: float(), y: float() });
  const string = () => {
    const n = number();
    if (n > 128 || offset + n > b.length) throw Error("Invalid name.");
    const v = b.subarray(offset, offset + n).toString("utf8");
    offset += n;
    return v;
  };
  const tag = number();
  if (tag === 0) {
    const result = {
      type: "welcome",
      playerId: number(),
      tick: number(),
      tickrate: number(),
      mode: byte(),
    };
    if (result.tickrate !== 50 || result.mode > 2)
      throw Error("Incompatible runtime.");
    return result;
  }
  if (tag === 2) return { type: "pong", clientTime: number(), tick: number() };
  if (tag !== 1) throw Error("Unknown server message.");
  const tick = number(),
    count = number();
  if (count > 256) throw Error("Too many players.");
  const players = [];
  for (let i = 0; i < count; i++) {
    const player = {
      id: number(),
      name: string(),
      position: vector(),
      velocity: vector(),
      aim: vector(),
    };
    const dir = byte();
    player.dir = dir > 127 ? dir - 256 : dir;
    player.hookState = byte();
    player.hookPosition = vector();
    player.alive = boolean();
    player.score = signed();
    player.health = signed();
    player.armor = signed();
    player.weapon = byte();
    player.scale = float();
    player.finished = boolean();
    players.push(player);
  }
  const projectiles = number();
  if (projectiles > 4096) throw Error("Too many projectiles.");
  for (let i = 0; i < projectiles; i++) {
    number();
    number();
    number();
    vector();
    vector();
    number();
  }
  const ack = number(),
    mapDone = boolean();
  if (offset !== b.length) throw Error("Unexpected protocol data.");
  return { type: "snapshot", tick, players, ack, mapDone };
}
