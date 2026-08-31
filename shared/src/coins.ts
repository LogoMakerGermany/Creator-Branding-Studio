export type CoinTransactionType = 'purchase' | 'spend' | 'refund' | 'bonus' | 'subscription';

export type CoinSourceType =
  | 'generation'
  | 'purchase'
  | 'welcome'
  | 'admin'
  | 'refund'
  | 'marketplace'
  | 'dev_purchase';

export interface CoinTransaction {
  id: string;
  userId: string;
  type: CoinTransactionType;
  amount: number;
  balanceAfter: number;
  /** Additive; older rows may omit this. */
  balanceBefore?: number;
  category?: string;
  description: string;
  reason?: string;
  sourceType?: CoinSourceType | string;
  sourceId?: string;
  jobId?: string;
  quoteId?: string;
  paymentProvider?: 'stripe' | 'paypal';
  paymentReference?: string;
  refundOfTransactionId?: string;
  idempotencyKey?: string;
  adminActorId?: string;
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
  ULTIMATE_CREATOR_PACK = 'ultimate_creator_pack',
  VIDEO_EDIT = 'video_edit',
  MARKETPLACE_PURCHASE = 'marketplace_purchase',
  MOCKUP_GENERATION = 'mockup_generation',
  STREAMSET_PACK = 'streamset_pack',
  TEXT_GENERATION = 'text_generation',
  SHORTS_CLIP = 'shorts_clip',
  ANIMATION_GENERATION = 'animation_generation',
  NEXTER_VOICE = 'nexter_voice',
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
  [CoinSpendCategory.ULTIMATE_CREATOR_PACK]: 65,
  [CoinSpendCategory.VIDEO_EDIT]: 20,
  [CoinSpendCategory.MARKETPLACE_PURCHASE]: 0,
  [CoinSpendCategory.MOCKUP_GENERATION]: 8,
  [CoinSpendCategory.STREAMSET_PACK]: 50,
  [CoinSpendCategory.TEXT_GENERATION]: 2,
  [CoinSpendCategory.SHORTS_CLIP]: 20,
  [CoinSpendCategory.ANIMATION_GENERATION]: 25,
  [CoinSpendCategory.NEXTER_VOICE]: 3,
};
