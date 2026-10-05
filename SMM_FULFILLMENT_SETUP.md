# JB Boster — SMM PWR Fulfillment Setup

This version keeps the existing JB Boster application, PostgreSQL database and KoraPay payment flow. Social-media order fulfillment is server-side through SMM PWR's standard API v2.

## Required Render variables

```text
SMM_PROVIDER_API_URL=https://smmpwr.com/api/v2
SMM_PROVIDER_API_KEY=YOUR_SMM_PWR_API_KEY
SMM_USD_NGN_RATE=YOUR_CURRENT_USD_TO_NGN_RATE
SMM_DEFAULT_MARKUP_PERCENT=50
NAIRA_PER_COIN=1.5
SMM_AUTO_REFRESH_PRICES=true
SMM_LOW_BALANCE_THRESHOLD=5
```

`SMM_PROVIDER_API_KEY` is backend-only. Never put it in a Vite/React environment variable, source code, HTML, API response or client bundle.

`SMM_USD_NGN_RATE` is required because SMM PWR quotes wholesale service rates in USD while JB Boster's customer economy is NGN-backed coins (1 coin = ₦1.50 (100 coins = ₦150)). The administrator can override the resulting customer coin rate per service from the admin dashboard.

## First deployment

1. Add the variables above to Render.
2. Deploy the modified source.
3. Open **Boris Admin → Services / Fulfillment Provider**.
4. Click **Sync catalogue**.
5. Confirm the provider balance is visible.
6. Review imported services and set customer coin rates/markup.
7. Enable only the services you want customers to see.
8. Place a small real test order with a service that the provider currently lists as available.

## Fulfillment behavior

- Catalogue sync runs automatically and also has a manual admin sync button.
- Open provider orders are synchronized in batches of up to 100 IDs.
- Provider order status is mapped to JB Boster `PENDING`, `PROCESSING`, `PARTIAL`, `COMPLETED`, `CANCELLED`, or `FAILED`.
- Customer progress uses provider `remains` only.
- Provider order submission is not blindly retried after an ambiguous network timeout.
- Failed/cancelled accepted orders are refunded exactly once when the provider reports the final failure/cancellation.
- Partial orders are not automatically refunded in full.
- Refill/cancel controls appear only when the provider service reports support.
- Provider financial/wholesale cost data is restricted to the admin API; normal customers receive customer pricing only.

## Provider API

SMM PWR uses standard SMM Panel API v2 actions: `services`, `add`, `status`, batch `status`, `balance`, `refill`, `refill_status`, and `cancel`.

The API key is sent as a server-side form parameter. The React application never receives it.
