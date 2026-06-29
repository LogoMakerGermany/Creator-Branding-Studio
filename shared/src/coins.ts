export interface CoinTransaction {
  id: string;
  userId: string;
  type: 'purchase' | 'spend' | 'refund' | 'bonus' | 'subscription';
  amount: number;
  balanceAfter: number;
  category?: string;
  description: string;
  metadata?: Record<string, unknown>;
  stripePaymentIntentId?: string;
  paypalOrderId?: string;
  createdAt: string;
}

export interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  priceCents: number;
  currency: string;
  bonusCoins: number;
  isPopular: boolean;
  stripePriceId?: string;
}

export enum CoinSpendCategory {
  AI_IMAGE = 'ai_image',
  AI_VIDEO = 'ai_video',
  AI_MUSIC = 'ai_music',
  AI_VOICE = 'ai_voice',
  LOGO_GENERATION = 'logo_generation',
  BANNER_GENERATION = 'banner_generation',
  FACECAM_GENERATION = 'facecam_generation',
  OVERLAY_GENERATION = 'overlay_generation',
  STICKER_GENERATION = 'sticker_generation',
  BRANDING_PACK = 'branding_pack',
  VIDEO_EDIT = 'video_edit',
  MARKETPLACE_PURCHASE = 'marketplace_purchase',
}

export const COIN_COSTS: Record<CoinSpendCategory, number> = {
  [CoinSpendCategory.AI_IMAGE]: 5,
  [CoinSpendCategory.AI_VIDEO]: 25,
  [CoinSpendCategory.AI_MUSIC]: 10,
  [CoinSpendCategory.AI_VOICE]: 8,
  [CoinSpendCategory.LOGO_GENERATION]: 15,
  [CoinSpendCategory.BANNER_GENERATION]: 10,
  [CoinSpendCategory.FACECAM_GENERATION]: 10,
  [CoinSpendCategory.OVERLAY_GENERATION]: 12,
  [CoinSpendCategory.STICKER_GENERATION]: 8,
  [CoinSpendCategory.BRANDING_PACK]: 50,
  [CoinSpendCategory.VIDEO_EDIT]: 20,
  [CoinSpendCategory.MARKETPLACE_PURCHASE]: 0,
};
