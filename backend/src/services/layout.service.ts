import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsDelete, dsList } from '../lib/data-store.js';

export interface LayoutElement {
  id: string;
  type: 'facecam' | 'chatbox' | 'alert' | 'widget' | 'logo' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
}

export interface StreamLayout {
  id: string;
  userId: string;
  name: string;
  platform: 'obs' | 'streamlabs' | 'tiktok' | 'twitch';
  canvas: { width: number; height: number };
  elements: LayoutElement[];
  dnaId?: string;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'layouts';

export async function listLayouts(userId: string): Promise<StreamLayout[]> {
  const layouts = await dsList(COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc' });
  return layouts as unknown as StreamLayout[];
}

export async function getLayout(id: string, userId: string): Promise<StreamLayout | null> {
  const layout = await dsGet(COLLECTION, id);
  if (!layout || layout.userId !== userId) return null;
  return layout as unknown as StreamLayout;
}

export async function createLayout(
  userId: string,
  data: Pick<StreamLayout, 'name' | 'platform' | 'canvas' | 'elements' | 'dnaId'>
): Promise<StreamLayout> {
  const now = new Date().toISOString();
  const layout: StreamLayout = {
    id: randomUUID(),
    userId,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(COLLECTION, layout.id, layout as unknown as Record<string, unknown>);
  return layout;
}

export async function updateLayout(
  id: string,
  userId: string,
  updates: Partial<Pick<StreamLayout, 'name' | 'platform' | 'canvas' | 'elements'>>
): Promise<StreamLayout | null> {
  const existing = await getLayout(id, userId);
  if (!existing) return null;
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  await dsSet(COLLECTION, id, updated as unknown as Record<string, unknown>);
  return updated;
}

export async function deleteLayout(id: string, userId: string): Promise<boolean> {
  const existing = await getLayout(id, userId);
  if (!existing) return false;
  await dsDelete(COLLECTION, id);
  return true;
}

export function exportLayout(layout: StreamLayout, format: 'obs' | 'streamlabs' | 'json') {
  if (format === 'json') {
    return JSON.stringify(layout, null, 2);
  }

  const sceneName = layout.name.replace(/[^a-zA-Z0-9]/g, '_');
  const sources = layout.elements.map((el) => ({
    name: el.label || el.type,
    type: el.type === 'facecam' ? 'dshow_input' : el.type === 'text' ? 'text_gdiplus_v2' : 'browser_source',
    position: { x: el.x, y: el.y },
    size: { width: el.width, height: el.height },
  }));

  return JSON.stringify({
    format: format === 'obs' ? 'obs-scene-collection-v1' : 'streamlabs-scene-v1',
    sceneName,
    canvas: layout.canvas,
    platform: layout.platform,
    sources,
    exportedAt: new Date().toISOString(),
  }, null, 2);
}
