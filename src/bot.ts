import { Bot } from "grammy";
import { getAddress } from "viem";
import { getClaimEligibilityBatch } from "./chain.js";
import {
  listChatSubscriptions,
  subscribeWallet,
  unsubscribeChat,
  unsubscribeWallet,
} from "./db.js";
import { CLAIM_URL, shortAddress, statusLine } from "./format.js";

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

const WELCOME =
  "👋 <b>Welcome to the GoodDollar UBI reminder bot!</b>\n\n" +
  "I'll ping you whenever your daily G$ UBI is ready to claim, so you never miss a day.\n\n" +
  "Send me your Celo wallet address (the one you claim with) to get started — it looks like <code>0x1234…abcd</code>.\n\n" +
  "I only ever <i>read</i> public chain data. I will never ask for a seed phrase or private key — and neither will anyone from GoodDollar.";

const HELP =
  "<b>Commands</b>\n" +
  "/status — check your wallets right now\n" +
  "/list — show the wallets I'm watching for you\n" +
  "/remove <code>0x…</code> — stop watching one wallet\n" +
  "/stop — stop all reminders\n" +
  "/help — this message\n\n" +
  "Send any wallet address to add it to your reminders.\n\n" +
  `Claims reset daily at 12:00 UTC. Claim at ${CLAIM_URL}`;

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.command("start", (ctx) => ctx.reply(WELCOME, { parse_mode: "HTML" }));
  bot.command("help", (ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));

  bot.command("list", async (ctx) => {
    const subs = await listChatSubscriptions(String(ctx.chat.id));
    if (subs.length === 0) {
      await ctx.reply(
        "I'm not watching any wallets for you yet. Send me an address to begin.",
      );
      return;
    }
    const lines = subs
      .map((s) => `• <code>${getAddress(s.wallet)}</code>`)
      .join("\n");
    await ctx.reply(`👀 Watching:\n${lines}`, { parse_mode: "HTML" });
  });

  bot.command("status", async (ctx) => {
    const subs = await listChatSubscriptions(String(ctx.chat.id));
    if (subs.length === 0) {
      await ctx.reply(
        "I'm not watching any wallets for you yet. Send me an address to begin.",
      );
      return;
    }
    try {
      const results = await getClaimEligibilityBatch(
        subs.map((s) => s.wallet),
      );
      await ctx.reply(results.map(statusLine).join("\n"), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await ctx.reply(
        "⚠️ Couldn't reach the Celo network right now. Please try again in a minute.",
      );
    }
  });

  bot.command("remove", async (ctx) => {
    const match = ctx.match?.match(ADDRESS_RE);
    if (!match) {
      await ctx.reply(
        "Send the address to remove, e.g. /remove 0x1234…\nUse /list to see watched wallets.",
      );
      return;
    }
    const removed = await unsubscribeWallet(String(ctx.chat.id), match[0]);
    await ctx.reply(
      removed
        ? `🗑 Stopped watching <code>${shortAddress(match[0])}</code>.`
        : "That address wasn't on your watch list.",
      { parse_mode: "HTML" },
    );
  });

  bot.command("stop", async (ctx) => {
    const count = await unsubscribeChat(String(ctx.chat.id));
    await ctx.reply(
      count > 0
        ? "🔕 Reminders stopped for all your wallets. Send an address anytime to start again."
        : "You had no active reminders. Send a wallet address to start.",
    );
  });

  // Any message containing a wallet address subscribes it.
  bot.on("message:text", async (ctx) => {
    const match = ctx.message.text.match(ADDRESS_RE);
    if (!match) {
      await ctx.reply(
        "That doesn't look like a wallet address. Send a Celo address like <code>0x1234…abcd</code>, or /help for commands.",
        { parse_mode: "HTML" },
      );
      return;
    }

    const wallet = getAddress(match[0]);

    // Only watch GoodDollar-verified wallets: unverified addresses can't
    // claim UBI anyway, and rejecting them keeps spam out of the scan set.
    let result;
    try {
      [result] = await getClaimEligibilityBatch([wallet]);
    } catch {
      await ctx.reply(
        "⚠️ Couldn't reach the Celo network to verify that address. Please try again in a minute.",
      );
      return;
    }

    if (!result.isWhitelisted) {
      await ctx.reply(
        `⚪️ <code>${shortAddress(wallet)}</code> isn't GoodDollar-verified, so it can't claim UBI and I won't watch it.\n\n` +
          "Verify your face in the GoodWallet app or on GoodDapp first, then send the address again.",
        { parse_mode: "HTML" },
      );
      return;
    }

    await subscribeWallet(String(ctx.chat.id), wallet);

    let firstCheck = `\n\n${statusLine(result)}`;
    if (result.eligible) {
      firstCheck += `\n👉 <a href="${CLAIM_URL}">Claim now on GoodDapp</a>`;
    }

    await ctx.reply(
      `🔔 Got it! I'm now watching <code>${shortAddress(wallet)}</code> and will remind you daily when your UBI is claimable.${firstCheck}`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  bot.catch((err) => {
    console.error("[bot] update error:", err.error);
  });

  return bot;
}
