import type { CoinPackage } from './coins';

export const COIN_PACKAGE_DEFINITIONS: Omit<CoinPackage, 'stripePriceId'>[] = [
  {
    id: 'starter',
    name: 'Starter',
    coins: 100,
    priceCents: 499,
    bonusCoins: 0,
    currency: 'eur',
    isPopular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    coins: 500,
    priceCents: 1999,
    bonusCoins: 50,
    currency: 'eur',
    isPopular: true,
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    coins: 1500,
    priceCents: 4999,
    bonusCoins: 200,
    currency: 'eur',
    isPopular: false,
  },
];

export type CoinPackageId = (typeof COIN_PACKAGE_DEFINITIONS)[number]['id'];
