export function startServer({
  server,
  PORT,
  LISTEN_HOST,
  GAME_DIR,
  TWITCH_CHANNEL,
  KICK_CHANNEL,
  builderWarmHeartbeat,
  resourceWatcher,
  getResourceDebounce,
  teeBridge,
  twitch,
  host,
  localChat,
  studioBuilds,
  publicLink,
}) {
  server.listen(PORT, LISTEN_HOST, () => {
    console.log(
      `[vibe-arena] players  -> http://localhost:${server.address().port}/`,
    );
    console.log(
      `[vibe-arena] overlay  -> http://localhost:${server.address().port}/overlay.html`,
    );
    console.log(`[vibe-arena] chat test-> type in this terminal, or !cmd`);
    console.log(`[vibe-arena] game dir -> ${GAME_DIR}`);
    if (TWITCH_CHANNEL)
      console.log(`[vibe-arena] twitch   -> ${TWITCH_CHANNEL}`);
    if (KICK_CHANNEL)
      console.log(`[vibe-arena] kick webhook -> POST /webhook/kick`);
    publicLink?.start(server.address().port).then((status) => {
      if (status.state !== "live")
        console.log(
          `[vibe-arena] public   -> none (${status.reason}) · !join will say so`,
        );
    });
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(builderWarmHeartbeat);
    resourceWatcher.close();
    clearTimeout(getResourceDebounce());
    teeBridge.stop();
    publicLink?.stop();
    twitch?.close();
    host.stop();
    localChat.close();
    server.close();
    if (studioBuilds.running) {
      const running = studioBuilds.running;
      try {
        await studioBuilds.cancel(running.id);
        let timer;
        try {
          await Promise.race([
            running.promise,
            new Promise((resolve) => {
              timer = setTimeout(resolve, 45000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      } catch {}
      if (studioBuilds.running)
        console.error(
          "Managed guest cleanup still requires reconciliation; independent lease timers remain.",
        );
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
