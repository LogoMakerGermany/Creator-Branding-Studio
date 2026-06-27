import { dsGet, dsSet } from '../lib/data-store.js';
import { listAgenciesForUser, getAgency } from './agency.service.js';

export interface WhiteLabelConfig {
  enabled: boolean;
  customDomain?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  faviconUrl?: string;
  platformName?: string;
}

const CONFIG_COLLECTION = 'whiteLabelConfigs';

export async function getWhiteLabelConfig(userId: string): Promise<WhiteLabelConfig> {
  const stored = await dsGet(CONFIG_COLLECTION, userId);
  if (stored) return stored as unknown as WhiteLabelConfig;

  const agencies = await listAgenciesForUser(userId);
  const agency = agencies[0];
  const agencyConfig = agency ? (agency as { whiteLabel?: WhiteLabelConfig }).whiteLabel : undefined;

  return agencyConfig ?? {
    enabled: false,
    platformName: 'Ultimate Creator Branding Studio',
    primaryColor: '#7C3AED',
    secondaryColor: '#1E1B4B',
  };
}

export async function updateWhiteLabelConfig(userId: string, config: Partial<WhiteLabelConfig>): Promise<WhiteLabelConfig> {
  const current = await getWhiteLabelConfig(userId);
  const updated: WhiteLabelConfig = { ...current, ...config };

  await dsSet(CONFIG_COLLECTION, userId, updated as unknown as Record<string, unknown>);

  const agencies = await listAgenciesForUser(userId);
  const owned = agencies.find((a) => a.ownerId === userId);
  if (owned) {
    const agency = await getAgency(owned.id);
    if (agency) {
      (agency as { whiteLabel?: WhiteLabelConfig }).whiteLabel = updated;
      agency.updatedAt = new Date().toISOString();
      await dsSet('agencies', agency.id, agency as unknown as Record<string, unknown>);
    }
  }

  return updated;
}

export function previewWhiteLabel(config: WhiteLabelConfig) {
  return {
    previewUrl: config.logoUrl ?? null,
    cssVariables: {
      '--brand-primary': config.primaryColor ?? '#7C3AED',
      '--brand-secondary': config.secondaryColor ?? '#1E1B4B',
    },
    platformName: config.platformName ?? 'Ultimate Creator Branding Studio',
    customDomain: config.customDomain ?? null,
  };
}
