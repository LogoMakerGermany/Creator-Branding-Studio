import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsList } from '../lib/data-store.js';
import { getActiveDna } from './dna.service.js';
import { getPrimaryFrontendUrl } from '../config/env.js';

const CONFIG_COLLECTION = 'mobileAppConfig';
const DEVICES_COLLECTION = 'mobileDevices';

export interface MobileAppConfig {
  userId: string;
  pwaEnabled: boolean;
  pushEnabled: boolean;
  androidEnabled: boolean;
  iosEnabled: boolean;
  appName: string;
  themeColor: string;
  splashColor: string;
  shortName: string;
  installUrl: string;
  updatedAt: string;
}

export interface MobileDevice {
  id: string;
  userId: string;
  platform: 'android' | 'ios' | 'pwa';
  deviceName: string;
  lastActiveAt: string;
  pushToken?: string;
  createdAt: string;
}

export async function getMobileConfig(userId: string): Promise<MobileAppConfig> {
  const stored = await dsGet(CONFIG_COLLECTION, userId);
  if (stored) return stored as unknown as MobileAppConfig;

  const dna = await getActiveDna(userId);
  const primary = dna?.primaryColors[0] ?? '#7C3AED';
  const secondary = dna?.secondaryColors[0] ?? '#1E1B4B';

  const config: MobileAppConfig = {
    userId,
    pwaEnabled: true,
    pushEnabled: false,
    androidEnabled: false,
    iosEnabled: false,
    appName: dna ? `${dna.name} Studio` : 'UCBS Creator',
    shortName: 'UCBS',
    themeColor: primary,
    splashColor: secondary,
    installUrl: getPrimaryFrontendUrl(),
    updatedAt: new Date().toISOString(),
  };

  await dsSet(CONFIG_COLLECTION, userId, config as unknown as Record<string, unknown>);
  return config;
}

export async function updateMobileConfig(userId: string, data: Partial<MobileAppConfig>): Promise<MobileAppConfig> {
  const current = await dsGet(CONFIG_COLLECTION, userId) as unknown as MobileAppConfig | null;
  const base = current ?? { userId, pwaEnabled: true, pushEnabled: false, androidEnabled: false, iosEnabled: false, appName: 'UCBS', shortName: 'UCBS', themeColor: '#7C3AED', splashColor: '#1E1B4B', installUrl: getPrimaryFrontendUrl(), updatedAt: new Date().toISOString() };
  const updated = { ...base, ...data, userId, updatedAt: new Date().toISOString() };
  await dsSet(CONFIG_COLLECTION, userId, updated as unknown as Record<string, unknown>);
  return updated as MobileAppConfig;
}

export async function listDevices(userId: string): Promise<MobileDevice[]> {
  const devices = await dsList(DEVICES_COLLECTION, { userId, orderBy: 'lastActiveAt', order: 'desc' });
  return devices as unknown as MobileDevice[];
}

export async function registerDevice(
  userId: string,
  data: { platform: MobileDevice['platform']; deviceName: string; pushToken?: string }
): Promise<MobileDevice> {
  const now = new Date().toISOString();
  const device: MobileDevice = {
    id: randomUUID(),
    userId,
    platform: data.platform,
    deviceName: data.deviceName,
    pushToken: data.pushToken,
    lastActiveAt: now,
    createdAt: now,
  };
  await dsSet(DEVICES_COLLECTION, device.id, device as unknown as Record<string, unknown>);
  return device;
}

export function getPwaManifest(_userId: string, config: MobileAppConfig) {
  return {
    name: config.appName,
    short_name: config.shortName,
    description: 'Ultimate Creator Branding Studio — KI-Web-App für Creator',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: config.splashColor,
    theme_color: config.themeColor,
    orientation: 'any',
    icons: [
      { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Dashboard', url: '/dashboard', description: 'Creator Hub' },
      { name: 'Coins', url: '/coins', description: 'Coins aufladen' },
    ],
  };
}

export function getStoreLinks() {
  return {
    android: { status: 'planned', url: null, note: 'Native Android-App — geplant für eine spätere Version' },
    ios: { status: 'planned', url: null, note: 'Native iOS-App — geplant für eine spätere Version' },
    pwa: { status: 'available', note: 'Web-App im Browser oder als PWA installieren (Chrome: Menü → App installieren)' },
  };
}
