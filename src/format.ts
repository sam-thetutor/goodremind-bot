import type { ClaimEligibilityResult } from "./chain.js";

export const CLAIM_URL = "https://gooddapp.org";

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Round the formatted G$ amount to 2 decimals for chat display. */
export function formatAmount(formatted: string): string {
  const value = Number(formatted);
  return Number.isFinite(value) ? value.toFixed(2) : formatted;
}

/** One status line per wallet for /status and post-subscribe checks. */
export function statusLine(result: ClaimEligibilityResult): string {
  const addr = `<code>${shortAddress(result.wallet)}</code>`;
  if (result.eligible) {
    return `🟢 ${addr} — <b>${formatAmount(result.claimAmountFormatted)} G$</b> ready to claim!`;
  }
  if (!result.isWhitelisted) {
    return `⚪️ ${addr} — not GoodDollar-verified yet. Verify in the GoodWallet app to start claiming.`;
  }
  return `✅ ${addr} — already claimed today. Next claim opens at 12:00 UTC.`;
}

export function reminderMessage(results: ClaimEligibilityResult[]): string {
  const lines = results.map(statusLine).join("\n");
  return (
    `⏰ <b>Your daily G$ UBI is waiting!</b>\n\n${lines}\n\n` +
    `👉 <a href="${CLAIM_URL}">Claim now on GoodDapp</a> before the day rolls over.`
  );
}
