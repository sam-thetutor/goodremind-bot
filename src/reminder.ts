import type { Bot } from "grammy";
import { GrammyError } from "grammy";
import {
  getClaimEligibilityBatch,
  getCurrentDay,
  type ClaimEligibilityResult,
} from "./chain.js";
import { deactivateChats, listActiveSubscribers, markReminded } from "./db.js";
import { reminderMessage } from "./format.js";

const DEFAULT_INTERVAL_MINUTES = 15;

/**
 * One reminder pass: for every active subscription that hasn't been reminded
 * for the current UBI day, batch-read eligibility and message the chats whose
 * wallets have an unclaimed entitlement. `lastRemindedDay` guarantees at most
 * one reminder per wallet per claim cycle (the day flips at 12:00 UTC).
 */
export async function runReminderPass(bot: Bot): Promise<void> {
  const subscribers = await listActiveSubscribers();
  if (subscribers.length === 0) return;

  const currentDay = await getCurrentDay();
  const pending = subscribers.filter((s) => s.lastRemindedDay !== currentDay);
  if (pending.length === 0) return;

  const wallets = [...new Set(pending.map((s) => s.wallet))];
  const results = await getClaimEligibilityBatch(wallets);
  const byWallet = new Map(results.map((r) => [r.wallet.toLowerCase(), r]));

  // Group each chat's claimable wallets into a single message.
  const byChat = new Map<
    string,
    { subIds: string[]; results: ClaimEligibilityResult[] }
  >();
  for (const sub of pending) {
    const result = byWallet.get(sub.wallet);
    if (!result?.eligible) continue;
    const entry = byChat.get(sub.chatId) ?? { subIds: [], results: [] };
    entry.subIds.push(sub.id);
    entry.results.push(result);
    byChat.set(sub.chatId, entry);
  }

  const remindedIds: string[] = [];
  const blockedChats: string[] = [];

  for (const [chatId, { subIds, results: chatResults }] of byChat) {
    try {
      await bot.api.sendMessage(chatId, reminderMessage(chatResults), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      remindedIds.push(...subIds);
    } catch (error) {
      // 403 = user blocked the bot / chat gone: stop scanning that chat.
      if (error instanceof GrammyError && error.error_code === 403) {
        blockedChats.push(chatId);
      } else {
        console.error(`[reminder] failed to message chat ${chatId}:`, error);
      }
    }
  }

  await markReminded(remindedIds, currentDay);
  await deactivateChats(blockedChats);

  if (remindedIds.length > 0 || blockedChats.length > 0) {
    console.log(
      `[reminder] day=${currentDay} reminded=${remindedIds.length} blocked=${blockedChats.length}`,
    );
  }
}

/** Kick off the recurring reminder loop (interval configurable via env). */
export function startReminderLoop(bot: Bot): void {
  const minutes = Number(
    process.env.REMINDER_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES,
  );
  const intervalMs = Math.max(1, minutes) * 60_000;

  const tick = () =>
    runReminderPass(bot).catch((error) =>
      console.error("[reminder] pass failed:", error),
    );

  void tick();
  setInterval(tick, intervalMs);
  console.log(`[reminder] scanning every ${Math.max(1, minutes)} minute(s)`);
}
