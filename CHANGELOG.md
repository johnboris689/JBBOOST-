
## 2026-09-17 — Order details and target-aware ordering
- Order forms now change the target field to profile/channel/username or post/video URL according to the selected service.
- Quantity and coin cost are calculated before placing an order, with validation before submission.
- Orders are now tappable and open a detailed view showing order ID, target, quantity, cost, opened time, estimated completion, delivered quantity, remaining quantity, and latest progress update.
- Added persistent order progress/completion metadata and safe PostgreSQL upgrades for existing databases.
- Added configurable estimated delivery time to social services.
- Customer order details refresh periodically while open.
# JB Boster Changelog

## Current release — KoraPay-only wallet and database cleanup

- KoraPay is now the only payment provider.
- Every deposit creates a fresh KoraPay hosted checkout session.
- Removed legacy payment-provider integrations and configuration.
- Added KoraPay webhook signature validation and direct transaction verification.
- Added duplicate-payment protection for wallet credits.
- Added transaction eligibility enforcement: 5 successful referrals + verified ₦520 minimum deposit.
- Set minimum withdrawal to ₦5,000.
- Removed legacy welcome-capital messaging and daily balance reset behavior.
- Added a one-time registration welcome screen.
- Reworked the live activity ticker to display real completed database activity instead of hardcoded claims.
- Added profile-picture upload and database persistence.
- Added a dedicated `nevo` PostgreSQL schema for production data.
- Removed demo user/admin seeding.
- Updated project documentation and environment configuration for JB Boster.

## 2026-09-17 — SMM PWR fulfillment integration
- Added server-side SMM PWR API v2 integration.
- Added live provider service catalogue synchronization and availability tracking.
- Added provider mappings, provider order/status/refill/sync audit tables.
- Replaced hardcoded social-service ordering with live provider-backed ordering.
- Added atomic coin reservation, provider submission, status reconciliation, and exact-once refunds for final provider failures/cancellations.
- Added batched provider status synchronization (up to 100 provider order IDs per request).
- Added target validation by service type and customer-side live coin pricing.
- Added admin fulfillment controls for catalogue sync, provider balance, mappings, pricing, order sync, refill and cancellation.
- Kept KoraPay and the existing PostgreSQL database/authentication flow intact.
