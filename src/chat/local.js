// Local chat source: lets you test commands from the server terminal.
// Type "user: !quake" or just "!quake" (user=tester).

import readline from "node:readline";

export function createLocalChat(onChat) {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });
  rl.on("line", (line) => {
    line = line.trim();
    if (!line) return;
    const m = line.match(/^(\S+):\s*(.+)$/);
    const [user, text] = m ? [m[1], m[2]] : ["tester", line];
    onChat({ user, text, source: "local" });
  });
  return { close: () => rl.close() };
}
