/** JB Boster coin economy: 1,000 coins = ₦500. */
export const COINS_PER_NAIRA = 2;
export const NAIRA_PER_COIN = 0.5;
export const MIN_KORAPAY_NAIRA = 520;
export const MIN_COIN_PURCHASE = MIN_KORAPAY_NAIRA * COINS_PER_NAIRA;

export const nairaToCoins = (naira: number) => Math.round(Number(naira || 0) * COINS_PER_NAIRA);
export const coinsToNaira = (coins: number) => Number(coins || 0) * NAIRA_PER_COIN;
export const formatCoins = (coins: number) => `${Math.max(0, Math.round(Number(coins || 0))).toLocaleString()} coins`;
