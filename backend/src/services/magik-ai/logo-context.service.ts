import { randomUUID } from 'node:crypto';
import type { LogoGenerationOptions } from '@ucbs/shared';
import { analyzeMagikName, collectMagikColors, resolveMagikCharacter } from '@ucbs/shared';
import type { MagikLogoContextRecord } from '@ucbs/shared';
import { dsSet, dsList } from '../../lib/data-store.js';

const COLLECTION = 'magik_ai_logo_context';

export type LogoContextVariantInput = {
  jobId: string;
  variant: 'a' | 'b';
  prompt: string;
  imageUrl?: string;
};

function resolveFigure(opts: LogoGenerationOptions): string {
  if (opts.magikMode === 'character') {
    return resolveMagikCharacter(opts.magikCharacter, opts.customCharacter) || 'custom character';
  }
  if (!opts.logoName?.trim()) return 'name-derived mascot';
  return analyzeMagikName(opts.logoName.trim()).summary;
}

/** Speichert Logo-Kontext nach jeder Generierung — intern, ohne UI. */
export async function recordMagikLogoContexts(
  userId: string,
  opts: LogoGenerationOptions,
  variants: LogoContextVariantInput[]
): Promise<MagikLogoContextRecord[]> {
  const colors = collectMagikColors(opts);
  const figure = resolveFigure(opts);
  const style = opts.magikStyle ?? opts.style ?? 'Ultra-Cinematic';
  const background = opts.magikBackground ?? (opts.transparentBackground ? 'transparent' : 'dark');
  const logoName = opts.logoName?.trim() ?? '';
  const createdAt = new Date().toISOString();

  const records: MagikLogoContextRecord[] = [];

  for (const item of variants) {
    const record: MagikLogoContextRecord = {
      id: randomUUID(),
      userId,
      jobId: item.jobId,
      variant: item.variant,
      logoName,
      style,
      colors,
      figure,
      background,
      prompt: item.prompt,
      imageUrl: item.imageUrl,
      game: opts.game,
      logoArt: opts.magikLogoArt,
      magikMode: opts.magikMode,
      createdAt,
    };
    await dsSet(COLLECTION, record.id, record as unknown as Record<string, unknown>);
    records.push(record);
  }

  return records;
}

export async function listMagikLogoContexts(
  userId: string,
  limit = 20
): Promise<MagikLogoContextRecord[]> {
  const items = await dsList(COLLECTION, { userId, orderBy: 'createdAt', order: 'desc', limit });
  return items as unknown as MagikLogoContextRecord[];
}
