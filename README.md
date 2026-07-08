# GoodRemind

A Telegram bot that reminds [GoodDollar](https://gooddollar.org) members the moment their daily G$ UBI is ready to claim — so no one leaves free money on the table.

**Try it:** [t.me/goodbot_real_bot](https://t.me/goodbot_real_bot)

## How it works

1. A user sends the bot the Celo wallet address they claim with.
2. Every 15 minutes the bot batch-reads claim eligibility for all subscribed wallets straight from GoodDollar's contracts on Celo (`UBIScheme.checkEntitlement` + `Identity.isWhitelisted`, one multicall for everyone).
3. When a wallet has an unclaimed entitlement, the bot sends one reminder with the amount and a claim link — at most **one reminder per wallet per UBI day** (the day flips at 12:00 UTC).
4. `/status` gives a live, on-demand check at any time.

The bot is strictly **read-only**: it reads public chain data, never holds keys, and never asks for a seed phrase.

## Commands

| Command | What it does |
| --- | --- |
| `/start` | Welcome + instructions |
| *(send an address)* | Watch that wallet |
| `/status` | Live claim status for your wallets |
| `/list` | Wallets being watched |
| `/remove 0x…` | Stop watching one wallet |
| `/stop` | Stop all reminders |
| `/help` | Command reference |

## Setup

Requirements: Node.js 20+, a Postgres database, and a bot token from [@BotFather](https://t.me/BotFather).

```bash
git clone https://github.com/sam-thetutor/goodremind-bot.git
cd goodremind-bot
npm install

cp .env.example .env   # fill in TELEGRAM_BOT_TOKEN and DATABASE_URL

npm run db:push        # creates the telegram_subscribers table
npm run dev            # start in watch mode
```

For production:

```bash
npm run build
npm start              # or run dist/index.js under pm2 / systemd
```

The bot uses long polling, so it needs no public URL, webhook, or open ports — any machine that stays online works.

## Configuration

| Env var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | yes | — | Bot token from @BotFather |
| `DATABASE_URL` | yes | — | Postgres connection string |
| `CELO_RPC_URL` | no | `https://forno.celo.org` | Celo RPC endpoint |
| `REMINDER_INTERVAL_MINUTES` | no | `15` | Scan frequency |

## Project layout

```
src/
  index.ts     entrypoint — env, commands menu, long polling
  bot.ts       command handlers + address subscription
  reminder.ts  the recurring reminder pass
  chain.ts     GoodDollar contract reads on Celo (viem multicall)
  db.ts        Prisma client + subscription queries
  format.ts    HTML message formatting
prisma/
  schema.prisma  one table: telegram_subscribers
site/
  index.html   landing page (static, no build step)
```

## On-chain reads

| Contract | Address (Celo mainnet) | Used for |
| --- | --- | --- |
| UBIScheme | `0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1` | `checkEntitlement`, `currentDay` |
| Identity | `0xC361A6E67822a0EDc17D899227dd9FC50BD62F42` | `isWhitelisted` |

## License

MIT
