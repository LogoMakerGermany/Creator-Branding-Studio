import type { CreatorDNA } from '@ucbs/shared';
import { buildDnaPromptContext } from '@ucbs/shared';
import { randomUUID } from 'node:crypto';
import { dsList, dsSet, dsGet, dsDelete } from '../lib/data-store.js';

export type PromptProvider =
  | 'chatgpt'
  | 'flux'
  | 'runway'
  | 'midjourney'
  | 'imagen'
  | 'gemini';

export interface ProviderPromptPack {
  provider: PromptProvider;
  label: string;
  prompt: string;
  notes: string;
}

export interface SavedPromptSet {
  id: string;
  userId: string;
  dnaId: string;
  title: string;
  purpose: string;
  basePrompt: string;
  providers: ProviderPromptPack[];
  createdAt: string;
}

const COLLECTION = 'prompt_sets';

function baseCreativeBrief(dna: CreatorDNA, purpose: string, topic?: string): string {
  const topicLine = topic?.trim() || purpose;
  return [
    `Create ${topicLine} for creator brand "${dna.name}"`,
    buildDnaPromptContext(dna),
    dna.promptStyle ? `Prompt style preference: ${dna.promptStyle}` : null,
  ]
    .filter(Boolean)
    .join('. ');
}

export function buildProviderPromptPack(
  dna: CreatorDNA,
  purpose: string,
  topic?: string
): ProviderPromptPack[] {
  const base = baseCreativeBrief(dna, purpose, topic);
  const ar =
    purpose.includes('tiktok') || purpose.includes('short') || purpose.includes('vertical')
      ? '9:16'
      : purpose.includes('banner')
        ? '16:9'
        : '1:1';

  return [
    {
      provider: 'chatgpt',
      label: 'ChatGPT',
      prompt: `${base}\n\nWrite a detailed creative brief and step-by-step generation plan. Include composition, lighting, typography, and do-not-use rules.`,
      notes: 'Best for briefs, iteration plans, and multi-step workflows.',
    },
    {
      provider: 'flux',
      label: 'Flux',
      prompt: `${base}, ultra detailed, high fidelity, natural lighting, sharp focus, professional branding asset`,
      notes: 'Natural photoreal / illustration Flux phrasing.',
    },
    {
      provider: 'runway',
      label: 'Runway',
      prompt: `${base}. Cinematic motion, smooth camera, 5s clip, brand-consistent color grade, no text overlays unless requested.`,
      notes: 'Optimized for text-to-video motion cues.',
    },
    {
      provider: 'midjourney',
      label: 'Midjourney',
      prompt: `${base} --ar ${ar} --stylize 250 --v 6 --style raw`,
      notes: `Includes --ar ${ar} and Midjourney parameters.`,
    },
    {
      provider: 'imagen',
      label: 'Imagen',
      prompt: `${base}. Clean composition, brand-safe, high resolution, no watermarks, suitable for marketing use.`,
      notes: 'Concise Imagen-friendly wording.',
    },
    {
      provider: 'gemini',
      label: 'Gemini',
      prompt: `${base}\n\nRespond with: (1) final image/video prompt, (2) negative prompt, (3) three variation ideas matching the Creator DNA.`,
      notes: 'Structured Gemini output request.',
    },
  ];
}

export async function generateAndSavePromptSet(
  userId: string,
  dna: CreatorDNA,
  input: { title: string; purpose: string; topic?: string }
): Promise<SavedPromptSet> {
  const providers = buildProviderPromptPack(dna, input.purpose, input.topic);
  const set: SavedPromptSet = {
    id: randomUUID(),
    userId,
    dnaId: dna.id,
    title: input.title.trim(),
    purpose: input.purpose,
    basePrompt: baseCreativeBrief(dna, input.purpose, input.topic),
    providers,
    createdAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, set.id, set as unknown as Record<string, unknown>);
  return set;
}

export async function listPromptSets(userId: string): Promise<SavedPromptSet[]> {
  const rows = await dsList(COLLECTION, { userId, orderBy: 'createdAt', order: 'desc' });
  return rows as unknown as SavedPromptSet[];
}

export async function getPromptSet(id: string, userId: string): Promise<SavedPromptSet | null> {
  const row = await dsGet(COLLECTION, id);
  if (!row || row.userId !== userId) return null;
  return row as unknown as SavedPromptSet;
}

export async function deletePromptSet(id: string, userId: string): Promise<boolean> {
  const existing = await getPromptSet(id, userId);
  if (!existing) return false;
  await dsDelete(COLLECTION, id);
  return true;
}
