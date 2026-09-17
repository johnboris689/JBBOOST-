# JB Boster Environment Variables

Set these in Render. Never commit live secrets to GitHub.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes for PostgreSQL production | Persistent PostgreSQL connection used by the application |
| `JWT_SECRET` | Yes | User authentication signing secret |
| `JWT_REFRESH_SECRET` | Yes | Refresh-token signing secret; use a different random value |
| `KORAPAY_SECRET_KEY` | Yes | KoraPay LIVE server-side API key |
| `KORAPAY_WEBHOOK_SECRET` | Yes | KoraPay webhook/signature verification secret |
| `APP_URL` | Yes | Public JB Boster URL used for payment callbacks |
| `ADMIN_EMAIL` | Yes | Administrator login email |
| `ADMIN_PASSWORD` | Yes | Strong administrator login password |
| `SUPPORT_EMAIL` | Optional | Customer support email |
| `SUPPORT_PHONE` | Optional | Customer support phone |
| `WHATSAPP_NUMBER` | Optional | WhatsApp support target |
| `GEMINI_API_KEY` | Optional | AI support features if enabled |
| `SENDER_NAME` | Optional | Email/SMS sender display name |

## Coin economy

JB Boster displays balances in coins. The internal wallet ledger remains in NGN for payment accounting. The conversion is fixed at **1,000 coins = ₦500** (2 coins per ₦1).

KoraPay checkout is still processed in NGN because it is the real payment provider. Customer-facing wallet and service pricing are displayed in coins.
