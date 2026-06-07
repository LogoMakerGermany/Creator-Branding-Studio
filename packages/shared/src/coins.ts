export type StreamingPlatform = 'twitch' | 'kick' | 'youtube' | 'tiktok';

export const STREAM_PLATFORMS: StreamingPlatform[] = ['twitch', 'kick', 'youtube', 'tiktok'];

export const STREAM_PLATFORM_LABELS: Record<StreamingPlatform, string> = {
  twitch: 'Twitch',
  kick: 'Kick',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

export type CoinTransactionType = 'debit' | 'credit' | 'refund' | 'purchase';

export interface CoinTransaction {
  id: string;
  userId: string;
  type: CoinTransactionType;
  amount: number;
  balanceAfter: number;
  reason: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  priceEur: number;
  popular?: boolean;
}

export const COIN_PACKAGES: CoinPackage[] = [
  { id: 'starter', name: 'Starter', coins: 100, priceEur: 9.99 },
  { id: 'creator', name: 'Creator', coins: 500, priceEur: 39.99, popular: true },
  { id: 'pro', name: 'Pro Studio', coins: 1000, priceEur: 69.99 },
];

export type PaymentProvider = 'stripe' | 'paypal';

export interface PaymentRecord {
  id: string;
  userId: string;
  provider: PaymentProvider;
  packageId: string;
  coins: number;
  amountEur: number;
  status: 'pending' | 'completed' | 'failed' | 'mock';
  externalId?: string;
  createdAt: string;
}

export const COIN_COSTS: Record<string, number> = {
  logo: 5,
  banner: 8,
  facecam: 6,
  overlay: 10,
  panel: 4,
  thumbnail: 6,
  sticker: 3,
  stickers_pack: 15,
  stream_set: 40,
  stream_pack: 40,
  intro: 20,
  outro: 20,
  stinger: 12,
  transition: 12,
  loading: 10,
  offline: 8,
  starting_soon: 8,
  brb: 8,
  ending: 8,
  default: 5,
};

export function getCoinCost(assetType: string, count = 1): number {
  const unit = COIN_COSTS[assetType] ?? COIN_COSTS.default;
  return unit * count;
}

export const DEFAULT_USER_COINS = 50;
export const ADMIN_COINS = 9999;
export const TESTER_COINS = 200;
