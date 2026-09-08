import { randomUUID } from 'node:crypto';
import { STREAM_LAYOUT_PRESETS } from '@ucbs/shared';
import { dsGet, dsSet, dsList } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { sanitizeZipEntryName } from '../lib/zip-store.js';
import { requireOwnedFacecamJob } from './facecam.service.js';
import { requireOwnedOverlayJob } from './overlay.service.js';
import { requireOwnedStickerJob } from './sticker.service.js';
import { requireOwnedLogoJob } from './streamset.service.js';
import { getUserFile, getRecentUserFiles, getFileBySourceJobId, mintDownloadUrlForOwnedFile, saveUserFile } from './file-cloud.service.js';
import { getProject } from './project.service.js';

export const LAYOUT_MIN_CANVAS = 320;
export const LAYOUT_MAX_CANVAS = 3840;
export const LAYOUT_MAX_PIXELS = 3840 * 2160;
export const LAYOUT_MIN_ELEMENT = 20;
export const LAYOUT_MAX_ELEMENT_W = 3840;
export const LAYOUT_MAX_ELEMENT_H = 2160;

export type LayoutElementType =
  | 'facecam'
  | 'chatbox'
  | 'alert'
  | 'widget'
  | 'logo'
  | 'text'
  | 'image'
  | 'frame'
  | 'overlay'
  | 'gameplay';

export type LayoutPlatform = 'obs' | 'streamlabs' | 'tiktok' | 'twitch' | 'youtube' | 'custom';

export interface LayoutElement {
  id: string;
  type: LayoutElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
  imageUrl?: string;
  content?: string;
  borderWidth?: number;
  borderRadius?: number;
  borderColor?: string;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  zIndex?: number;
  fontSize?: number;
  fontWeight?: number | string;
  textAlign?: 'left' | 'center' | 'right';
  fileId?: string;
  sourceFacecamJobId?: string;
  sourceOverlayJobId?: string;
  sourceStickerJobId?: string;
  sourceLogoJobId?: string;
  assetMissing?: boolean;
}

export interface LayoutBackground {
  mode: 'transparent' | 'solid';
  color?: string;
}

export interface StreamLayout {
  id: string;
  userId: string;
  name: string;
  platform: LayoutPlatform;
  canvas: { width: number; height: number };
  elements: LayoutElement[];
  background?: LayoutBackground;
  projectId?: string;
  dnaId?: string;
  version?: number;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'layouts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateCanvas(canvas: { width: number; height: number }): { width: number; height: number } {
  if (!isFiniteNumber(canvas.width) || !isFiniteNumber(canvas.height)) {
    throw new ServiceError(400, 'INVALID_DIMENSIONS', 'Ungültige Canvas-Größe');
  }
  const width = Math.round(canvas.width);
  const height = Math.round(canvas.height);
  if (width < LAYOUT_MIN_CANVAS || height < LAYOUT_MIN_CANVAS) {
    throw new ServiceError(400, 'INVALID_DIMENSIONS', `Mindestgröße ${LAYOUT_MIN_CANVAS}×${LAYOUT_MIN_CANVAS}`);
  }
  if (width > LAYOUT_MAX_CANVAS || height > LAYOUT_MAX_CANVAS || width * height > LAYOUT_MAX_PIXELS) {
    throw new ServiceError(400, 'INVALID_DIMENSIONS', 'Canvas-Größe außerhalb der Limits');
  }
  return { width, height };
}

export function validateElementGeometry(el: LayoutElement, canvas: { width: number; height: number }): LayoutElement {
  const fields = [el.x, el.y, el.width, el.height];
  if (fields.some((n) => !isFiniteNumber(n) || n === Infinity || n === -Infinity)) {
    throw new ServiceError(400, 'INVALID_POSITION', 'Ungültige Elementposition oder -größe');
  }
  if (el.width < LAYOUT_MIN_ELEMENT || el.height < LAYOUT_MIN_ELEMENT) {
    throw new ServiceError(400, 'INVALID_SIZE', 'Element ist zu klein');
  }
  if (el.width > LAYOUT_MAX_ELEMENT_W || el.height > LAYOUT_MAX_ELEMENT_H) {
    throw new ServiceError(400, 'INVALID_SIZE', 'Element ist zu groß');
  }
  return {
    ...el,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Math.round(el.width),
    height: Math.round(el.height),
    zIndex: typeof el.zIndex === 'number' && Number.isFinite(el.zIndex) ? Math.round(el.zIndex) : el.zIndex,
    visible: el.visible !== false,
    opacity: el.opacity == null ? 1 : Math.min(1, Math.max(0, el.opacity)),
  };
}

function validateElements(elements: LayoutElement[], canvas: { width: number; height: number }): LayoutElement[] {
  return elements.map((el, index) => {
    const next = validateElementGeometry(el, canvas);
    return { ...next, zIndex: next.zIndex ?? index };
  });
}

async function assertOwnedProject(userId: string, projectId?: string): Promise<void> {
  if (!projectId) return;
  const project = await getProject(projectId, userId);
  if (!project || project.deletedAt) {
    throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }
}

async function assertOwnedReferencedElements(userId: string, elements: LayoutElement[]): Promise<void> {
  for (const el of elements) {
    if (el.sourceFacecamJobId) {
      await requireOwnedFacecamJob(userId, el.sourceFacecamJobId);
    }
    if (el.sourceOverlayJobId) {
      await requireOwnedOverlayJob(userId, el.sourceOverlayJobId);
    }
    if (el.sourceStickerJobId) {
      await requireOwnedStickerJob(userId, el.sourceStickerJobId);
    }
    if (el.sourceLogoJobId) {
      await requireOwnedLogoJob(userId, el.sourceLogoJobId);
    }
    if (el.fileId) {
      const file = await getUserFile(el.fileId, userId);
      if (!file) {
        throw new ServiceError(403, 'FOREIGN_ASSET', 'Asset gehört nicht zu diesem Account oder ist nicht verfügbar');
      }
    }
  }
}

function isOwnedLayoutRecord(row: Record<string, unknown> | null, userId: string): boolean {
  if (!row) return false;
  const owner = row.userId;
  return typeof owner === 'string' && owner.length > 0 && owner === userId;
}

export async function listLayouts(userId: string): Promise<StreamLayout[]> {
  const layouts = (await dsList(COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc' })) as unknown as StreamLayout[];
  return layouts.filter((layout) => isOwnedLayoutRecord(layout as unknown as Record<string, unknown>, userId) && !layout.deletedAt);
}

export async function getLayout(id: string, userId: string): Promise<StreamLayout | null> {
  const layout = await dsGet(COLLECTION, id);
  if (!isOwnedLayoutRecord(layout, userId)) return null;
  if ((layout as { deletedAt?: string }).deletedAt) return null;
  return layout as unknown as StreamLayout;
}

export async function createLayout(
  userId: string,
  data: Pick<StreamLayout, 'name' | 'platform' | 'canvas' | 'elements' | 'dnaId'> & {
    projectId?: string;
    background?: LayoutBackground;
  }
): Promise<StreamLayout> {
  const canvas = validateCanvas(data.canvas ?? { width: 1920, height: 1080 });
  const elements = validateElements(data.elements ?? [], canvas);
  await assertOwnedProject(userId, data.projectId);
  await assertOwnedReferencedElements(userId, elements);
  const now = new Date().toISOString();
  const layout: StreamLayout = {
    id: randomUUID(),
    userId,
    name: data.name,
    platform: data.platform,
    canvas,
    elements,
    background: data.background ?? { mode: 'transparent' },
    projectId: data.projectId,
    dnaId: data.dnaId,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(COLLECTION, layout.id, layout as unknown as Record<string, unknown>);
  return layout;
}

export async function updateLayout(
  id: string,
  userId: string,
  updates: Partial<Pick<StreamLayout, 'name' | 'platform' | 'canvas' | 'elements' | 'projectId' | 'background'>>
): Promise<StreamLayout | null> {
  const existing = await getLayout(id, userId);
  if (!existing) return null;
  if (updates.projectId) await assertOwnedProject(userId, updates.projectId);
  const canvas = updates.canvas ? validateCanvas(updates.canvas) : existing.canvas;
  const elements = updates.elements ? validateElements(updates.elements, canvas) : existing.elements;
  if (updates.elements) await assertOwnedReferencedElements(userId, elements);
  const updated: StreamLayout = {
    ...existing,
    ...updates,
    canvas,
    elements,
    version: (existing.version ?? 1) + 1,
    updatedAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, id, updated as unknown as Record<string, unknown>);
  return updated;
}

export async function deleteLayout(id: string, userId: string): Promise<boolean> {
  const existing = await getLayout(id, userId);
  if (!existing) return false;
  const updated: StreamLayout = { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await dsSet(COLLECTION, id, updated as unknown as Record<string, unknown>);
  return true;
}

export async function duplicateLayout(id: string, userId: string): Promise<StreamLayout | null> {
  const existing = await getLayout(id, userId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const copy: StreamLayout = {
    ...existing,
    id: randomUUID(),
    name: `${existing.name} Kopie`,
    elements: existing.elements.map((el) => ({ ...el, id: randomUUID() })),
    version: 1,
    deletedAt: undefined,
    createdAt: now,
    updatedAt: now,
  };
  delete copy.deletedAt;
  await dsSet(COLLECTION, copy.id, copy as unknown as Record<string, unknown>);
  return copy;
}

export function mapPresetSlotType(type: string): LayoutElementType {
  if (type === 'chat') return 'chatbox';
  if (type === 'facecam') return 'facecam';
  if (type === 'gameplay') return 'gameplay';
  return 'overlay';
}

export function elementsFromPreset(platform: 'twitch' | 'tiktok' | 'youtube'): LayoutElement[] {
  const preset = STREAM_LAYOUT_PRESETS[platform];
  return preset.slots.map((slot, index) => ({
    id: randomUUID(),
    type: mapPresetSlotType(slot.type),
    x: slot.x,
    y: slot.y,
    width: slot.width,
    height: slot.height,
    label: slot.label,
    visible: true,
    locked: false,
    zIndex: index,
    opacity: 1,
  }));
}

export async function createLayoutFromPreset(
  userId: string,
  platform: 'twitch' | 'tiktok' | 'youtube',
  extra?: { name?: string; projectId?: string; dnaId?: string; background?: LayoutBackground }
): Promise<StreamLayout> {
  const preset = STREAM_LAYOUT_PRESETS[platform];
  return createLayout(userId, {
    name: extra?.name || preset.label,
    platform,
    canvas: { width: preset.width, height: preset.height },
    elements: elementsFromPreset(platform),
    projectId: extra?.projectId,
    dnaId: extra?.dnaId,
    background: extra?.background ?? { mode: 'transparent' },
  });
}

export function exportLayout(layout: StreamLayout, format: 'obs' | 'streamlabs' | 'json') {
  if (format === 'json') {
    return JSON.stringify(layout, null, 2);
  }

  const sceneName = layout.name.replace(/[^a-zA-Z0-9]/g, '_');
  const sources = layout.elements
    .filter((el) => el.visible !== false)
    .map((el) => {
      const isMedia = el.type === 'image' || el.type === 'frame' || el.type === 'overlay' || (el.type === 'logo' && el.imageUrl);
      return {
        name: el.label || el.type,
        type: el.type === 'facecam'
          ? el.imageUrl
            ? 'browser_source'
            : 'dshow_input'
          : el.type === 'text'
            ? 'text_gdiplus_v2'
            : isMedia
              ? 'browser_source'
              : 'browser_source',
        position: { x: el.x, y: el.y },
        size: { width: el.width, height: el.height },
        ...(el.imageUrl ? { settings: { url: el.imageUrl } } : {}),
        ...(el.content ? { text: el.content } : {}),
      };
    });

  return JSON.stringify({
    format: format === 'obs' ? 'obs-scene-collection-v1' : 'streamlabs-scene-v1',
    sceneName,
    canvas: layout.canvas,
    platform: layout.platform,
    sources,
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

function xmlEscape(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasAssetReference(el: LayoutElement): boolean {
  return Boolean(el.fileId || el.sourceFacecamJobId || el.sourceOverlayJobId || el.sourceStickerJobId || el.sourceLogoJobId);
}

async function ownedJobForElement(userId: string, el: LayoutElement) {
  try {
    if (el.sourceFacecamJobId) return await requireOwnedFacecamJob(userId, el.sourceFacecamJobId);
    if (el.sourceOverlayJobId) return await requireOwnedOverlayJob(userId, el.sourceOverlayJobId);
    if (el.sourceStickerJobId) return await requireOwnedStickerJob(userId, el.sourceStickerJobId);
    if (el.sourceLogoJobId) return await requireOwnedLogoJob(userId, el.sourceLogoJobId);
  } catch (err) {
    if (err instanceof ServiceError) return null;
    throw err;
  }
  return null;
}

async function resolveOwnedFileForElement(userId: string, el: LayoutElement) {
  if (el.fileId) {
    const owned = await getUserFile(el.fileId, userId);
    if (owned) return owned;
  }
  const job = await ownedJobForElement(userId, el);
  if (!job) return null;
  if (job.fileId) {
    const fromJob = await getUserFile(job.fileId, userId);
    if (fromJob) return fromJob;
  }
  return getFileBySourceJobId(userId, job.id);
}

async function resolveElementImage(userId: string, el: LayoutElement): Promise<string | null> {
  const file = await resolveOwnedFileForElement(userId, el);
  if (file) {
    const minted = await mintDownloadUrlForOwnedFile(userId, file);
    return minted?.url ?? null;
  }
  if (!hasAssetReference(el) && el.imageUrl?.startsWith('data:')) return el.imageUrl;
  return null;
}

export async function hydrateLayout(layout: StreamLayout, userId: string): Promise<StreamLayout> {
  const elements: LayoutElement[] = [];
  for (const el of layout.elements) {
    if (!hasAssetReference(el)) {
      elements.push({ ...el, assetMissing: false });
      continue;
    }
    const file = await resolveOwnedFileForElement(userId, el);
    const url = file ? (await mintDownloadUrlForOwnedFile(userId, file))?.url : null;
    elements.push({
      ...el,
      fileId: file?.id ?? el.fileId,
      imageUrl: url ?? undefined,
      assetMissing: !url,
    });
  }
  return { ...layout, elements };
}

export async function exportLayoutSvgFile(
  id: string,
  userId: string
): Promise<{ fileId: string; downloadUrl: string; filename: string }> {
  const layout = await getLayout(id, userId);
  if (!layout) throw new ServiceError(404, 'NOT_FOUND', 'Layout nicht gefunden');

  const visible = [...layout.elements]
    .filter((el) => el.visible !== false)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  const parts: string[] = [];
  const bg = layout.background?.mode === 'solid' ? xmlEscape(layout.background.color || '#000000') : 'none';
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.canvas.width}" height="${layout.canvas.height}" viewBox="0 0 ${layout.canvas.width} ${layout.canvas.height}">`
  );
  parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`);

  for (const el of visible) {
    const href = await resolveElementImage(userId, el);
    if (hasAssetReference(el) && !href) {
      throw new ServiceError(409, 'EXPORT_MISSING_ASSET', 'Export blockiert: Asset nicht verfügbar');
    }
    if (href && !href.startsWith('data:') && !href.startsWith('http')) {
      throw new ServiceError(409, 'EXPORT_MISSING_ASSET', 'Export blockiert: unsichere Asset-Quelle');
    }
    const opacity = el.opacity ?? 1;
    if (href?.startsWith('data:') || href?.startsWith('http')) {
      parts.push(
        `<image href="${xmlEscape(href)}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" opacity="${opacity}" preserveAspectRatio="xMidYMid meet"/>`
      );
    } else if (el.type === 'text') {
      const size = el.fontSize ?? 32;
      const align = el.textAlign ?? 'middle';
      const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
      const tx = align === 'left' ? el.x + 8 : align === 'right' ? el.x + el.width - 8 : el.x + el.width / 2;
      parts.push(
        `<text x="${tx}" y="${el.y + el.height / 2}" fill="${xmlEscape(el.color || '#ffffff')}" font-size="${size}" font-weight="${xmlEscape(String(el.fontWeight ?? 600))}" text-anchor="${anchor}" opacity="${opacity}">${xmlEscape(el.content || el.label || '')}</text>`
      );
    } else {
      parts.push(
        `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${xmlEscape(el.color || '#7C3AED')}40" stroke="${xmlEscape(el.color || '#7C3AED')}" stroke-dasharray="8 6" opacity="${opacity}"/>`
      );
      parts.push(
        `<text x="${el.x + el.width / 2}" y="${el.y + el.height / 2}" fill="#ffffff" font-size="24" text-anchor="middle">${xmlEscape(el.label || el.type)}</text>`
      );
    }
  }
  parts.push('</svg>');
  const svg = parts.join('');
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  const filename = sanitizeZipEntryName(
    `${layout.name}-${layout.platform}-layout-v${layout.version ?? 1}.svg`,
    'layout.svg'
  );
  const file = await saveUserFile(userId, {
    name: filename,
    mimeType: 'image/svg+xml',
    category: 'project',
    dataUrl,
    source: 'generation',
    projectId: layout.projectId,
  });
  return { fileId: file.id, downloadUrl: file.downloadUrl || dataUrl, filename };
}

export function duplicateElement(elements: LayoutElement[], elementId: string): LayoutElement[] {
  const source = elements.find((el) => el.id === elementId);
  if (!source) return elements;
  const copy: LayoutElement = {
    ...source,
    id: randomUUID(),
    x: source.x + 24,
    y: source.y + 24,
    zIndex: (source.zIndex ?? 0) + 1,
  };
  return [...elements, copy];
}

export function moveElementLayer(elements: LayoutElement[], elementId: string, direction: 'forward' | 'back'): LayoutElement[] {
  const index = elements.findIndex((el) => el.id === elementId);
  if (index < 0) return elements;
  const next = [...elements];
  const swapWith = direction === 'forward' ? index + 1 : index - 1;
  if (swapWith < 0 || swapWith >= next.length) return elements;
  const tmp = next[index]!;
  next[index] = next[swapWith]!;
  next[swapWith] = tmp;
  return next.map((el, i) => ({ ...el, zIndex: i }));
}

function layoutElementMatches(el: LayoutElement, token: string): boolean {
  const hay = `${el.type} ${el.label ?? ''}`.toLowerCase();
  return hay.includes(token);
}

export async function applyNexterLayoutCommand(
  userId: string,
  message: string,
  extra?: { projectId?: string; dnaId?: string }
): Promise<{ layout: StreamLayout; message: string; followUp?: boolean }> {
  const lower = message.toLowerCase();
  const layouts = await listLayouts(userId);
  let layout = layouts[0];

  if (/mach mir ein tiktok layout|tiktok[- ]?layout/.test(lower) && !/gaming|overlay/.test(lower)) {
    layout = await createLayoutFromPreset(userId, 'tiktok', extra);
    return { layout, message: `TikTok-Layout „${layout.name}“ ist angelegt (1080×1920). Keine Coins, keine AI-Generierung.` };
  }
  if (/mach mir ein twitch layout|twitch[- ]?layout/.test(lower) && !/overlay|gaming/.test(lower)) {
    layout = await createLayoutFromPreset(userId, 'twitch', extra);
    return { layout, message: `Twitch-Layout „${layout.name}“ ist angelegt (1920×1080). Keine Coins.` };
  }
  if (/mach daraus ein twitch layout/.test(lower)) {
    if (!layout) {
      layout = await createLayoutFromPreset(userId, 'twitch', extra);
      return { layout, message: 'Ich habe ein Twitch-Layout aus dem Preset angelegt.' };
    }
    const updated = await updateLayout(layout.id, userId, {
      platform: 'twitch',
      canvas: { width: 1920, height: 1080 },
      elements: elementsFromPreset('twitch'),
    });
    return { layout: updated!, message: 'Das aktuelle Layout ist jetzt ein Twitch-Preset (16:9).' };
  }

  if (/facecam oben.{0,80}gameplay.{0,80}chat/.test(lower)) {
    layout = await createLayoutFromPreset(userId, 'tiktok', extra);
    return { layout, message: 'TikTok-Layout: Facecam oben, Gameplay in der Mitte, Chat unten.' };
  }

  if (!layout) {
    return {
      layout: await createLayoutFromPreset(userId, 'twitch', extra),
      message: 'Ich habe ein leeres Twitch-Layout angelegt. Sag mir, welches Element ich ändern soll.',
      followUp: true,
    };
  }

  if (/hintergrund (schwarz|black)/.test(lower)) {
    const updated = await updateLayout(layout.id, userId, { background: { mode: 'solid', color: '#000000' } });
    return { layout: updated!, message: 'Hintergrund ist jetzt schwarz.' };
  }
  if (/hintergrund transparent/.test(lower)) {
    const updated = await updateLayout(layout.id, userId, { background: { mode: 'transparent' } });
    return { layout: updated!, message: 'Hintergrund ist transparent.' };
  }

  const typeHint = /facecam/.test(lower)
    ? 'facecam'
    : /chat/.test(lower)
      ? 'chatbox'
      : /gameplay/.test(lower)
        ? 'gameplay'
        : /logo/.test(lower)
          ? 'logo'
          : /sticker/.test(lower)
            ? 'sticker'
            : /overlay/.test(lower)
              ? 'overlay'
              : null;

  const matches = typeHint
    ? layout.elements.filter((el) => {
        if (typeHint === 'sticker') return Boolean(el.sourceStickerJobId) || layoutElementMatches(el, 'sticker');
        return el.type === typeHint || layoutElementMatches(el, typeHint);
      })
    : layout.elements;

  if (/mach das gr(ö|oe)sser|mach das kleiner/.test(lower) && !typeHint) {
    return {
      layout,
      followUp: true,
      message: 'Welches Element meinst du? Facecam, Gameplay, Chat, Logo oder Sticker?',
    };
  }

  if (matches.length > 1 && typeHint && !/alle|beide/.test(lower)) {
    return {
      layout,
      followUp: true,
      message: `Ich habe ${matches.length} passende Elemente. Welches soll ich ändern?`,
    };
  }

  const target = matches[0];
  if (!target && (/kleiner|gr(ö|oe)sser|verschieb|blende/.test(lower)) && !/setz mein logo|nimm mein letztes logo/.test(lower)) {
    return { layout, followUp: true, message: 'Ich finde das Element im aktuellen Layout nicht.' };
  }

  if (target && /kleiner/.test(lower)) {
    const elements = layout.elements.map((el) =>
      el.id === target.id ? { ...el, width: Math.max(LAYOUT_MIN_ELEMENT, Math.round(el.width * 0.75)), height: Math.max(LAYOUT_MIN_ELEMENT, Math.round(el.height * 0.75)) } : el
    );
    const updated = await updateLayout(layout.id, userId, { elements });
    return { layout: updated!, message: `${target.label || target.type} ist kleiner.` };
  }
  if (target && /gr(ö|oe)sser/.test(lower)) {
    const elements = layout.elements.map((el) =>
      el.id === target.id ? { ...el, width: Math.round(el.width * 1.25), height: Math.round(el.height * 1.25) } : el
    );
    const updated = await updateLayout(layout.id, userId, { elements });
    return { layout: updated!, message: `${target.label || target.type} ist größer.` };
  }
  if (target && /verschieb.*unten|nach unten/.test(lower)) {
    const elements = layout.elements.map((el) =>
      el.id === target.id ? { ...el, y: Math.max(0, layout.canvas.height - el.height - 24) } : el
    );
    const updated = await updateLayout(layout.id, userId, { elements });
    return { layout: updated!, message: `${target.label || target.type} sitzt unten.` };
  }
  if (target && /oben rechts/.test(lower) && !/setz mein logo|nimm mein letztes logo/.test(lower)) {
    const elements = layout.elements.map((el) =>
      el.id === target.id ? { ...el, x: Math.max(0, layout.canvas.width - el.width - 24), y: 24 } : el
    );
    const updated = await updateLayout(layout.id, userId, { elements });
    return { layout: updated!, message: `${target.label || target.type} sitzt oben rechts.` };
  }
  if (target && /blende|ausblenden|versteck/.test(lower)) {
    const elements = layout.elements.map((el) => (el.id === target.id ? { ...el, visible: false } : el));
    const updated = await updateLayout(layout.id, userId, { elements });
    return { layout: updated!, message: `${target.label || target.type} ist ausgeblendet, bleibt aber gespeichert.` };
  }

  if (/nimm mein letztes logo|setz mein logo/.test(lower)) {
    const logos = await getRecentUserFiles(userId, { category: 'logo', limit: 5 });
    if (logos.length > 1 && !/letztes|letzten/.test(lower)) {
      return { layout, followUp: true, message: `Ich habe ${logos.length} eigene Logos. Welches soll ins Layout?` };
    }
    const logo = logos[0];
    if (!logo) {
      return { layout, followUp: true, message: 'Kein eigenes Logo in der Datei Cloud.' };
    }
    const minted = await mintDownloadUrlForOwnedFile(userId, logo);
    const elements = [
      ...layout.elements,
      {
        id: randomUUID(),
        type: 'logo' as const,
        x: Math.max(24, layout.canvas.width - 220),
        y: 24,
        width: 180,
        height: 180,
        label: logo.name,
        fileId: logo.id,
        imageUrl: minted?.url,
        visible: true,
        zIndex: layout.elements.length,
      },
    ];
    const updated = await updateLayout(layout.id, userId, { elements });
    return { layout: updated!, message: `Eigenes Logo „${logo.name}“ ist oben rechts im Layout. Keine Dateikopie.` };
  }

  if (/nimm mein letztes facecam/.test(lower)) {
    const recent = await getRecentUserFiles(userId, { category: 'overlay', limit: 20 });
    const facecamFiles = recent.filter((file) => /facecam/i.test(file.name));
    if (facecamFiles.length > 1 && !/letztes|letzten/.test(lower)) {
      return { layout, followUp: true, message: `Ich habe ${facecamFiles.length} eigene Facecam-Dateien. Welche soll ins Layout?` };
    }
    const file = facecamFiles[0] ?? recent.find((f) => /facecam/i.test(f.name));
    if (!file) {
      return { layout, followUp: true, message: 'Kein eigenes Facecam-Result in der Datei Cloud.' };
    }
    const minted = await mintDownloadUrlForOwnedFile(userId, file);
    const zone = layout.elements.find((el) => el.type === 'facecam');
    const nextEl: LayoutElement = zone
      ? { ...zone, fileId: file.id, imageUrl: minted?.url, assetMissing: false, label: zone.label || file.name }
      : {
          id: randomUUID(),
          type: 'facecam',
          x: 24,
          y: 24,
          width: 320,
          height: 240,
          label: file.name,
          fileId: file.id,
          imageUrl: minted?.url,
          visible: true,
          zIndex: layout.elements.length,
        };
    const elements = zone
      ? layout.elements.map((el) => (el.id === zone.id ? nextEl : el))
      : [...layout.elements, nextEl];
    const updated = await updateLayout(layout.id, userId, { elements });
    return { layout: updated!, message: `Eigenes Facecam-Result „${file.name}“ ist im Layout. Keine Dateikopie.` };
  }

  return { layout, message: `Aktuelles Layout: „${layout.name}“ (${layout.canvas.width}×${layout.canvas.height}, ${layout.elements.length} Elemente).` };
}
