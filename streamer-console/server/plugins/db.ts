import { runMigrations } from "@agent-native/core/db";

import { MIGRATIONS } from "../db/migrations.js";

const migrate = runMigrations(MIGRATIONS, {
  table: "streamer_console_migrations",
});
let migrations: Promise<void> | undefined;

export function ensureAppMigrations() {
  return (migrations ??= Promise.resolve()
    .then(() => migrate(undefined))
    .catch((error) => {
      migrations = undefined;
      throw error;
    }));
}

export default ensureAppMigrations;
