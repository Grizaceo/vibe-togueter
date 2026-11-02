// Immutable participation snapshot carried with approved inputs and artifact bindings.
export function communityCredit(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid community credit.");
  const text = (v, max) => {
    if (typeof v !== "string" || !v.trim() || v.length > max)
      throw Error("Invalid community credit text.");
    return v.trim();
  };
  if (
    typeof value.roundId !== "string" ||
    typeof value.approvedInputHash !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(value.roundId) ||
    !/^[a-f0-9]{64}$/.test(value.approvedInputHash) ||
    !Number.isInteger(value.voterCount) ||
    value.voterCount < 0 ||
    value.voterCount > 10000 ||
    !Array.isArray(value.ideaAuthors) ||
    !value.ideaAuthors.length ||
    value.ideaAuthors.length > 10
  )
    throw Error("Invalid community credit binding.");
  const approvedBy = value.approvedBy;
  if (
    !approvedBy ||
    !["streamer", "delegated-moderator"].includes(approvedBy.authority)
  )
    throw Error("Invalid approval authority.");
  return {
    roundId: value.roundId,
    approvedInputHash: value.approvedInputHash,
    ideaAuthors: value.ideaAuthors.map((p) => ({ name: text(p.name, 50) })),
    voterCount: value.voterCount,
    approvedBy: {
      name: text(approvedBy.name, 100),
      source: text(approvedBy.source, 50),
      authority: approvedBy.authority,
    },
  };
}
