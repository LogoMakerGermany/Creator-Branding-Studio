import { randomUUID } from 'node:crypto';
import type {
  OrderPriceResult,
  OrderSelection,
  PriceComponent,
  PriceLineItem,
  PriceQuote,
  PublicPriceQuote,
} from '@ucbs/shared';
import { DEFAULT_PRICING_VERSION, DEFAULT_QUOTE_TTL_MINUTES } from '@ucbs/shared';
import { getPriceQuoteTtlMinutes } from '../config/env.js';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { getSystemSettings } from './system-settings.service.js';

const COMPONENTS_COLLECTION = 'price_components';
const QUOTES_COLLECTION = 'price_quotes';

const SEED_COMPONENTS: Omit<PriceComponent, 'id' | 'createdAt' | 'updatedAt' | 'validFrom'>[] = [
  {
    code: 'LOGO_BASE',
    category: 'base',
    displayName: 'Logo',
    description: 'Basispreis Logo-Generierung',
    priceCents: 299,
    internalCostCents: 40,
    minimumMarginCents: 100,
    provider: 'openai',
    providerModel: 'dall-e-3',
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'PROFILE_IMAGE',
    category: 'base',
    displayName: 'Profilbild',
    description: 'Creator-Profilbild',
    priceCents: 199,
    internalCostCents: 35,
    minimumMarginCents: 80,
    provider: 'openai',
    providerModel: 'dall-e-3',
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'SOCIAL_BANNER',
    category: 'base',
    displayName: 'Social Banner',
    description: 'Banner für Social Media',
    priceCents: 249,
    internalCostCents: 40,
    minimumMarginCents: 90,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'STREAM_BANNER',
    category: 'base',
    displayName: 'Stream Banner',
    description: 'Twitch/YouTube Stream-Banner',
    priceCents: 249,
    internalCostCents: 40,
    minimumMarginCents: 90,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'FACECAM_FRAME',
    category: 'base',
    displayName: 'Facecam-Rahmen',
    description: 'Webcam-Rahmen Overlay',
    priceCents: 249,
    internalCostCents: 40,
    minimumMarginCents: 90,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'STREAM_OVERLAY',
    category: 'base',
    displayName: 'Stream Overlay',
    description: 'HUD / Overlay Grafik',
    priceCents: 349,
    internalCostCents: 45,
    minimumMarginCents: 120,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'STARTING_SCREEN',
    category: 'base',
    displayName: 'Starting Soon',
    description: 'Stream startet bald',
    priceCents: 299,
    internalCostCents: 40,
    minimumMarginCents: 100,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'BRB_SCREEN',
    category: 'base',
    displayName: 'Be Right Back',
    description: 'Bin gleich zurück',
    priceCents: 299,
    internalCostCents: 40,
    minimumMarginCents: 100,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'END_SCREEN',
    category: 'base',
    displayName: 'End Screen',
    description: 'Stream beendet',
    priceCents: 299,
    internalCostCents: 40,
    minimumMarginCents: 100,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'STREAM_PACK',
    category: 'pack',
    displayName: 'Stream-Paket',
    description: 'Komplettes Stream-Branding-Paket',
    priceCents: 1999,
    internalCostCents: 280,
    minimumMarginCents: 600,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'TRANSPARENT_BACKGROUND',
    category: 'addon',
    displayName: 'Transparenter Hintergrund',
    description: 'PNG mit Transparenz',
    priceCents: 49,
    internalCostCents: 0,
    minimumMarginCents: 20,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'EXTRA_VARIANT',
    category: 'variant',
    displayName: 'Extra Variante',
    description: 'Zusätzliche Design-Variante',
    priceCents: 149,
    internalCostCents: 35,
    minimumMarginCents: 50,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'HIGH_RESOLUTION',
    category: 'quality',
    displayName: 'Hohe Auflösung',
    description: 'HD-Ausgabe',
    priceCents: 99,
    internalCostCents: 15,
    minimumMarginCents: 30,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'PREMIUM_QUALITY',
    category: 'quality',
    displayName: 'Premium Qualität',
    description: 'Höhere Modellqualität',
    priceCents: 199,
    internalCostCents: 50,
    minimumMarginCents: 60,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'ANIMATION_5_SECONDS',
    category: 'animation',
    displayName: 'Animation 5 Sekunden',
    description: 'Bild-zu-Video 5s',
    priceCents: 499,
    internalCostCents: 180,
    minimumMarginCents: 150,
    provider: 'runway',
    providerModel: 'gen3a_turbo',
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'ANIMATION_10_SECONDS',
    category: 'animation',
    displayName: 'Animation 10 Sekunden',
    description: 'Bild-zu-Video 10s',
    priceCents: 899,
    internalCostCents: 320,
    minimumMarginCents: 250,
    provider: 'runway',
    providerModel: 'gen3a_turbo',
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'VIDEO_HD',
    category: 'quality',
    displayName: 'Video HD',
    description: 'HD-Videoausgabe',
    priceCents: 149,
    internalCostCents: 40,
    minimumMarginCents: 40,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
  {
    code: 'AUDIO_OPTION',
    category: 'addon',
    displayName: 'Audio-Option',
    description: 'Optionaler Soundtrack',
    priceCents: 99,
    internalCostCents: 20,
    minimumMarginCents: 30,
    isActive: true,
    pricingVersion: DEFAULT_PRICING_VERSION,
  },
];

let seedPromise: Promise<void> | null = null;

export async function ensurePriceComponentsSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const existing = await dsList(COMPONENTS_COLLECTION);
    if (existing.length > 0) return;
    const now = new Date().toISOString();
    for (const seed of SEED_COMPONENTS) {
      const id = randomUUID();
      const row: PriceComponent = {
        ...seed,
        id,
        validFrom: now,
        createdAt: now,
        updatedAt: now,
      };
      await dsSet(COMPONENTS_COLLECTION, id, row as unknown as Record<string, unknown>);
    }
  })();
  return seedPromise;
}

export async function listActivePriceComponents(
  pricingVersion?: string
): Promise<PriceComponent[]> {
  await ensurePriceComponentsSeeded();
  const settings = await getSystemSettings();
  const version = pricingVersion || settings.activePricingVersion || DEFAULT_PRICING_VERSION;
  const rows = (await dsList(COMPONENTS_COLLECTION)) as unknown as PriceComponent[];
  const now = Date.now();
  return rows.filter(
    (c) =>
      c.isActive &&
      c.pricingVersion === version &&
      new Date(c.validFrom).getTime() <= now &&
      (!c.validUntil || new Date(c.validUntil).getTime() >= now)
  );
}

export function calculateOrderPrice(
  selection: OrderSelection,
  components: PriceComponent[]
): OrderPriceResult {
  if (!selection.componentCodes?.length) {
    throw new ServiceError(400, 'INVALID_INPUT', 'Keine Preispositionen ausgewählt');
  }

  const byCode = new Map(components.map((c) => [c.code, c]));
  const lineItems: PriceLineItem[] = [];
  let estimatedInternalCostCents = 0;
  let pricingVersion = components[0]?.pricingVersion || DEFAULT_PRICING_VERSION;

  for (const code of selection.componentCodes) {
    const component = byCode.get(code);
    if (!component) {
      throw new ServiceError(400, 'INVALID_INPUT', `Unbekannte Preiskomponente: ${code}`);
    }
    const quantity = Math.max(1, Math.floor(selection.quantities?.[code] ?? 1));
    if (!Number.isInteger(component.priceCents) || component.priceCents < 0) {
      throw new ServiceError(500, 'UNKNOWN_ERROR', `Ungültiger Preis für ${code}`);
    }
    pricingVersion = component.pricingVersion;
    lineItems.push({
      code: component.code,
      displayName: component.displayName,
      quantity,
      unitPriceCents: component.priceCents,
      totalCents: component.priceCents * quantity,
      category: component.category,
    });
    estimatedInternalCostCents += component.internalCostCents * quantity;
  }

  const subtotalCents = lineItems.reduce((sum, li) => sum + li.totalCents, 0);
  const discountCents = 0;
  const totalCents = subtotalCents - discountCents;
  const estimatedMarginCents = totalCents - estimatedInternalCostCents;

  return {
    lineItems,
    subtotalCents,
    discountCents,
    totalCents,
    currency: 'eur',
    pricingVersion,
    estimatedInternalCostCents,
    estimatedMarginCents,
  };
}

export async function createPriceQuote(
  userId: string,
  selection: OrderSelection
): Promise<PublicPriceQuote> {
  const components = await listActivePriceComponents();
  const priced = calculateOrderPrice(selection, components);
  const ttl = getPriceQuoteTtlMinutes() || DEFAULT_QUOTE_TTL_MINUTES;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 60_000).toISOString();

  const quote: PriceQuote = {
    quoteId: randomUUID(),
    userId,
    selection,
    ...priced,
    expiresAt,
    createdAt: now.toISOString(),
  };

  await dsSet(QUOTES_COLLECTION, quote.quoteId, quote as unknown as Record<string, unknown>);

  return toPublicQuote(quote);
}

export async function getPriceQuote(quoteId: string): Promise<PriceQuote | null> {
  const row = await dsGet(QUOTES_COLLECTION, quoteId);
  return row ? (row as unknown as PriceQuote) : null;
}

export async function assertQuoteValidForPayment(
  quoteId: string,
  userId: string,
  expectedTotalCents?: number
): Promise<PriceQuote> {
  const quote = await getPriceQuote(quoteId);
  if (!quote) {
    throw new ServiceError(404, 'PRICE_QUOTE_EXPIRED', 'Preisangebot nicht gefunden');
  }
  if (quote.userId !== userId) {
    throw new ServiceError(403, 'ACCESS_DENIED', 'Preisangebot gehört einem anderen Nutzer');
  }
  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    throw new ServiceError(410, 'PRICE_QUOTE_EXPIRED', 'Preisangebot ist abgelaufen');
  }

  const components = await listActivePriceComponents(quote.pricingVersion);
  const recalculated = calculateOrderPrice(quote.selection, components);
  if (recalculated.totalCents !== quote.totalCents) {
    throw new ServiceError(
      409,
      'PRICE_QUOTE_EXPIRED',
      'Preise haben sich geändert — bitte neues Angebot anfordern'
    );
  }
  if (expectedTotalCents != null && expectedTotalCents !== quote.totalCents) {
    throw new ServiceError(400, 'INVALID_INPUT', 'Übermittelter Betrag stimmt nicht mit dem Angebot überein');
  }

  return quote;
}

export function toPublicQuote(quote: PriceQuote): PublicPriceQuote {
  return {
    quoteId: quote.quoteId,
    lineItems: quote.lineItems,
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents,
    currency: quote.currency,
    pricingVersion: quote.pricingVersion,
    expiresAt: quote.expiresAt,
  };
}
