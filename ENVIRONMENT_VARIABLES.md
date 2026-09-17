# JB Boster Environment Variables

Set these in Render. Never commit live secrets to GitHub.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes when using Render PostgreSQL | Use the **Internal Database URL** from your Render PostgreSQL database. Do not use the external/public URL unless your database provider specifically requires it. |
| `JWT_SECRET` | Yes | User authentication signing secret |
| `JWT_REFRESH_SECRET` | Yes | Refresh-token signing secret; use a different random value |
| `KORAPAY_SECRET_KEY` | Yes | KoraPay LIVE **Secret Key**. Keep server-side only. |
| `KORAPAY_WEBHOOK_SECRET` | Yes | KoraPay webhook signature secret. If your KoraPay dashboard does not provide a separate webhook secret, the implementation can fall back to the secret key. |
| `APP_URL` | Yes | Public JB Boster URL used for payment callbacks |
| `ADMIN_EMAIL` | Yes | Administrator login email |
| `ADMIN_PASSWORD` | Yes | Strong administrator login password |
| `SUPPORT_EMAIL` | Optional | Customer support email |
| `SUPPORT_PHONE` | Optional | Customer support phone |
| `WHATSAPP_NUMBER` | Optional | WhatsApp support target |
| `GEMINI_API_KEY` | Optional | AI support features if enabled |
| `SENDER_NAME` | Optional | Email/SMS sender display name |

## Coin economy

JB Boster displays balances in coins. KoraPay payments are processed in NGN; the customer-facing wallet and service prices are displayed in coins. The conversion is fixed at **1,000 coins = ₦500** (2 coins per ₦1).

KoraPay checkout is still processed in NGN because it is the real payment provider. Customer-facing wallet and service pricing are displayed in coins.

## SMM PWR Fulfillment Provider

```text
SMM_PROVIDER_API_URL=https://smmpwr.com/api/v2
SMM_PROVIDER_API_KEY=
```

The SMM PWR API key is server-side only. Never expose it through `VITE_*`, React, browser JavaScript, HTML, API responses, logs, or GitHub.

Required/optional fulfillment configuration:

```text
SMM_USD_NGN_RATE=
SMM_DEFAULT_MARKUP_PERCENT=100
SMM_LOW_BALANCE_THRESHOLD=5
```

`SMM_USD_NGN_RATE` must be configured with the current USD/NGN conversion used for customer pricing. `SMM_DEFAULT_MARKUP_PERCENT` is only the starting markup for newly imported services; the administrator can set each service's customer coin rate from the admin dashboard.
