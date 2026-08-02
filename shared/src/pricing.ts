/** Money is always integer cents — never floating point. */

export type PriceComponentCategory =
  | 'base'
  | 'format'
  | 'quality'
  | 'variant'
  | 'animation'
  | 'addon'
  | 'pack';

export interface PriceComponent {
  id: string;
  code: string;
  category: PriceComponentCategory;
  displayName: string;
  description: string;
  priceCents: number;
  internalCostCents: number;
  minimumMarginCents: number;
  provider?: string;
  providerModel?: string;
  isActive: boolean;
  pricingVersion: string;
  validFrom: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSelection {
  componentCodes: string[];
  quantities?: Record<string, number>;
}

export interface PriceLineItem {
  code: string;
  displayName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  category: PriceComponentCategory;
}

export interface OrderPriceResult {
  lineItems: PriceLineItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: 'eur';
  pricingVersion: string;
  estimatedInternalCostCents: number;
  estimatedMarginCents: number;
}

export interface PriceQuote extends OrderPriceResult {
  quoteId: string;
  userId: string;
  selection: OrderSelection;
  expiresAt: string;
  createdAt: string;
}

/** Public quote response — no internal cost / margin. */
export interface PublicPriceQuote {
  quoteId: string;
  lineItems: PriceLineItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: 'eur';
  pricingVersion: string;
  expiresAt: string;
}

export const DEFAULT_PRICING_VERSION = 'v1';
export const DEFAULT_QUOTE_TTL_MINUTES = 15;
