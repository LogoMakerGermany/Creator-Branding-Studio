import type { RegistrationMode } from '@ucbs/shared';
import { getRegistrationModeEnv } from '../config/env.js';
import { dsGet, dsSet } from '../lib/data-store.js';

const SETTINGS_COLLECTION = 'system_settings';
const SETTINGS_DOC_ID = 'platform';

export interface SystemSettings {
  id: string;
  registrationMode: RegistrationMode;
  generationsEnabled: boolean;
  imageGenerationsEnabled: boolean;
  videoGenerationsEnabled: boolean;
  paymentsEnabled: boolean;
  activePricingVersion: string;
  updatedAt: string;
  updatedBy?: string;
}

function defaults(): SystemSettings {
  return {
    id: SETTINGS_DOC_ID,
    registrationMode: getRegistrationModeEnv(),
    generationsEnabled: true,
    imageGenerationsEnabled: true,
    videoGenerationsEnabled: true,
    paymentsEnabled: true,
    activePricingVersion: 'v1',
    updatedAt: new Date().toISOString(),
  };
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const row = await dsGet(SETTINGS_COLLECTION, SETTINGS_DOC_ID);
  if (!row) {
    const seed = defaults();
    await dsSet(SETTINGS_COLLECTION, SETTINGS_DOC_ID, seed as unknown as Record<string, unknown>);
    return seed;
  }
  return { ...defaults(), ...(row as unknown as SystemSettings), id: SETTINGS_DOC_ID };
}

export async function getRegistrationMode(): Promise<RegistrationMode> {
  const settings = await getSystemSettings();
  return settings.registrationMode;
}

export async function updateSystemSettings(
  patch: Partial<Omit<SystemSettings, 'id'>>,
  updatedBy?: string
): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const next: SystemSettings = {
    ...current,
    ...patch,
    id: SETTINGS_DOC_ID,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  await dsSet(SETTINGS_COLLECTION, SETTINGS_DOC_ID, next as unknown as Record<string, unknown>);
  return next;
}
