# JB Boster

JB Boster is a mobile-first social-media growth platform. Customers can choose a social platform, select a growth service, enter a target and quantity, see the exact coin cost, and place an order.

## Platforms
- Facebook
- Instagram
- TikTok
- YouTube
- X
- Telegram

## Coins
**1 JB Boster coin = ₦1.50 (100 coins = ₦150).**

The customer interface displays wallet balances and service costs in coins. KoraPay checkout is processed in Nigerian Naira because KoraPay is the real payment gateway.

## Payments
Buy Coins opens the real KoraPay hosted checkout. JB Boster credits the user's wallet only after server-side KoraPay verification or a valid signed webhook followed by provider verification. The verified amount must match the requested amount.

## User flow
1. Visitor lands on the JB Boster public landing page.
2. User creates an account or signs in.
3. User buys coins through KoraPay.
4. User selects Facebook, Instagram, TikTok, YouTube, X or Telegram.
5. User chooses a service and quantity.
6. JB Boster calculates the coin cost.
7. User places the order and tracks it in Orders/History.

There is no registration reward, daily earning program or referral requirement.

## Admin
The `/boris` admin area manages customers, social services, KoraPay payment records, withdrawals where enabled, and public settings. Social-service prices are controlled by the administrator.

## Development
```bash
npm install
npm run dev
```

## Production
```bash
npm install && npm run build
npm start
```

Never commit KoraPay, database or authentication secrets to GitHub.
