// Security headers for every controller response. frame-src follows the
// currently configured tee games, which the owner can change at runtime.
export function frameSrc(remoteGames) {
  const origins = new Set();
  try {
    for (const game of remoteGames?.catalog()?.games || []) {
      if (game.adapter !== "tee") continue;
      try {
        const url = new URL(game.baseURL);
        if (["http:", "https:"].includes(url.protocol))
          origins.add(url.origin);
      } catch {}
    }
  } catch {}
  return [...origins].join(" ") || "'none'";
}
export function applySecurityHeaders(res, remoteGames) {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; " +
      "connect-src 'self'; font-src 'self'; frame-src " +
      frameSrc(remoteGames) +
      "; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}
