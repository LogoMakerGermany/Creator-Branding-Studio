export interface MarketplaceItem {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  category: MarketplaceCategory;
  priceCoins: number;
  previewUrl: string;
  downloadUrl: string;
  tags: string[];
  rating: number;
  reviewCount: number;
  downloadCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MarketplaceCategory =
  | 'logo'
  | 'banner'
  | 'template'
  | 'intro'
  | 'overlay'
  | 'emote'
  | 'sound'
  | 'panel'
  | 'vtuber';

export interface MarketplacePurchase {
  id: string;
  buyerId: string;
  itemId: string;
  priceCoins: number;
  createdAt: string;
}

export interface MarketplaceReview {
  id: string;
  itemId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}
