# JB Boster — KoraPay setup

JB Boster uses KoraPay for **Buy Coins**. Do not replace it with Paystack.

## Render variables
- `KORAPAY_SECRET_KEY` — KoraPay live secret key (server only)
- `KORAPAY_WEBHOOK_SECRET` — webhook/signature secret
- `APP_URL` — public Render URL, e.g. `https://your-service.onrender.com`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DATABASE_URL`

## Webhook
Configure KoraPay to send payment notifications to:

`https://YOUR-DOMAIN/api/payment/webhook/korapay`

The server verifies the webhook signature and then performs a direct KoraPay payment verification before crediting the user's balance. A webhook alone never credits an account.

## Buy Coins flow
1. User selects an amount (minimum ₦520).
2. Server creates a pending `wallet_funding` transaction.
3. User is redirected to KoraPay hosted checkout.
4. KoraPay webhook/return is received.
5. Server verifies the payment with KoraPay.
6. Currency must be NGN and the verified amount must exactly match the requested amount.
7. User balance is credited once; repeated notifications are idempotent.
