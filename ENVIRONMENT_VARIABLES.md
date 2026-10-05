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

JB Boster displays balances in coins. KoraPay payments are processed in NGN; the customer-facing wallet and service prices are displayed in coins. The conversion is fixed at **1 coin = ₦1.50 (100 coins = ₦150)**.

KoraPay checkout is still processed in NGN because it is the real payment provider. Customer-facing wallet and service pricing are displayed in coins.

## SMM PWR Fulfillment Provider

```text
SMM_PROVIDER_API_URL=https://smmpwr.com/api/v2
SMM_PROVIDER_API_KEY=
SMM_PROVIDER_NAME=smm_pwr
SMM_PROVIDER_API_URL=https://smmpwr.com/api/v2
```

The SMM PWR API key is server-side only. Never expose it through `VITE_*`, React, browser JavaScript, HTML, API responses, logs, or GitHub.

Required/optional fulfillment configuration:

```text
SMM_USD_NGN_RATE=
SMM_DEFAULT_MARKUP_PERCENT=50
NAIRA_PER_COIN=1.5
SMM_AUTO_REFRESH_PRICES=true
SMM_LOW_BALANCE_THRESHOLD=5
```

`SMM_USD_NGN_RATE` must be configured with the current USD/NGN conversion used for customer pricing. `SMM_DEFAULT_MARKUP_PERCENT` is only the starting markup for newly imported services; the administrator can set each service's customer coin rate from the admin dashboard.


### Multi-provider fulfillment pool

JB Boster can connect several compatible SMM-panel APIs. The customer sees only JB Boster coin pricing; provider names and wholesale rates are server-side. The backend selects the lowest customer-cost eligible service for each platform/metric.

For each additional provider, configure:
```text
SMM_PROVIDER_1_NAME=provider_name
SMM_PROVIDER_1_API_URL=https://your-provider.example/api/v2
SMM_PROVIDER_1_API_KEY=your_secret_key
SMM_PROVIDER_2_NAME=provider_name_2
SMM_PROVIDER_2_API_URL=https://your-provider-2.example/api/v2
SMM_PROVIDER_2_API_KEY=your_secret_key_2
```
Optional aliases are supported for SMMWiz, FortuneSMM and SMM Royale with `SMMWIZ_API_URL`/`SMMWIZ_API_KEY`, `FORTUNESMM_API_URL`/`FORTUNESMM_API_KEY`, and `SMMROYALE_API_URL`/`SMMROYALE_API_KEY`. Only use API URLs documented by the provider.

Pricing: `NAIRA_PER_COIN=1.5` means 100 coins = ₦150. `SMM_DEFAULT_MARKUP_PERCENT=50` means a provider wholesale cost of ₦10 becomes a default customer cost of ₦15, which is 10 coins.
