import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Load .env from the repo root before anything reads process.env.
const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "../.env");
loadEnv({ path: existsSync(rootEnv) ? rootEnv : undefined });

const { createBot } = await import("./bot.js");
const { startReminderLoop } = await import("./reminder.js");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error(
    "TELEGRAM_BOT_TOKEN is not set. Create a bot with @BotFather and add the token to .env",
  );
  process.exit(1);
}

const bot = createBot(token);

await bot.api.setMyCommands([
  { command: "start", description: "Start and add a wallet" },
  { command: "status", description: "Check claim status now" },
  { command: "list", description: "Show watched wallets" },
  { command: "remove", description: "Stop watching a wallet" },
  { command: "stop", description: "Stop all reminders" },
  { command: "help", description: "How this bot works" },
]);

startReminderLoop(bot);

console.log("GoodRemind bot starting (long polling)…");
void bot.start({
  onStart: (me) => console.log(`Bot running as @${me.username}`),
});
