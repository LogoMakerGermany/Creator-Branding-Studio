import { randomUUID } from 'node:crypto';
import {
  CoinSpendCategory,
  mockupColorHex,
  type MockupGenerateInput,
  type MockupJob,
  type MockupProductCategory,
} from '@ucbs/shared';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import { withCoinCharge } from '../lib/billable-job.js';
import { uploadAssetFromDataUrl } from '../lib/firebase-storage.js';
import { resolveDnaForRequest } from './dna.service.js';
import { generateImage, getJobsByUser } from './ai.service.js';
import { ServiceError } from '../lib/errors.js';
import { enqueueJob } from '../lib/job-queue.js';
import { saveUserFile } from './file-cloud.service.js';
import { getProject, updateProject } from './project.service.js';
import { attachAssetToProject } from './project-assets.service.js';
import { AppError } from '../middleware/errorHandler.js';

const COLLECTION = 'mockupJobs';

const PRODUCT_LABEL: Record<MockupProductCategory, string> = {
  mug: 'Keramiktasse',
  tshirt: 'T-Shirt',
  hoodie: 'Hoodie',
  cap: 'Cap',
  phone: 'Phone Case',
  poster: 'Poster',
  tote: 'Tote Bag',
};

function productSvg(
  category: MockupProductCategory,
  fill: string,
  designUrl: string,
  scale: number,
  placement: string
): string {
  const s = Math.max(0.4, Math.min(1.4, scale / 100));
  const pos =
    placement === 'corner'
      ? { x: 520, y: 180 }
      : placement === 'wrap'
        ? { x: 400, y: 280 }
        : { x: 400, y: 250 };
  const w = 220 * s;
  const h = 220 * s;

  const body =
    category === 'mug'
      ? `<rect x="250" y="180" width="300" height="320" rx="24" fill="${fill}" stroke="#222" stroke-width="8"/>
         <path d="M550 240 h80 a50 50 0 0 1 0 160 h-80" fill="none" stroke="${fill}" stroke-width="28"/>
         <ellipse cx="400" cy="180" rx="150" ry="28" fill="#ddd"/>`
      : category === 'cap'
        ? `<ellipse cx="400" cy="340" rx="220" ry="90" fill="${fill}"/>
           <path d="M200 340 Q400 80 600 340" fill="${fill}" stroke="#111" stroke-width="6"/>`
        : category === 'phone'
          ? `<rect x="300" y="80" width="200" height="420" rx="36" fill="${fill}" stroke="#111" stroke-width="10"/>
             <rect x="330" y="120" width="140" height="300" rx="8" fill="#111"/>`
          : category === 'poster'
            ? `<rect x="180" y="60" width="440" height="560" fill="${fill}" stroke="#111" stroke-width="12"/>`
            : category === 'hoodie'
              ? `<path d="M220 200 L280 160 L400 140 L520 160 L580 200 L560 280 L520 260 L520 720 L280 720 L280 260 L240 280 Z" fill="${fill}" stroke="#111" stroke-width="8"/>`
              : category === 'tote'
                ? `<path d="M250 240 L290 240 L310 160 L490 160 L510 240 L550 240 L550 700 L250 700 Z" fill="${fill}" stroke="#111" stroke-width="8"/>
           <line x1="310" y1="160" x2="250" y2="240" stroke="#111" stroke-width="8"/>
           <line x1="490" y1="160" x2="550" y2="240" stroke="#111" stroke-width="8"/>`
                : `<path d="M250 160 L550 160 L620 720 L180 720 Z" fill="${fill}" stroke="#111" stroke-width="8"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="800" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#1a1a1e"/>
  ${body}
  <image href="${escapeXml(designUrl)}" xlink:href="${escapeXml(designUrl)}" x="${pos.x - w / 2}" y="${pos.y - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function embedDesign(designUrl: string): Promise<string> {
  if (designUrl.startsWith('data:')) return designUrl;
  try {
    const res = await fetch(designUrl);
    if (!res.ok) return designUrl;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return designUrl;
  }
}

export function buildCompositeDataUrl(input: {
  category: MockupProductCategory;
  colorId: string;
  placement: string;
  scalePercent: number;
  designUrl: string;
}): string {
  const svg = productSvg(
    input.category,
    mockupColorHex(input.colorId),
    input.designUrl,
    input.scalePercent,
    input.placement
  );
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function listMockups(userId: string): Promise<MockupJob[]> {
  const rows = await dsList(COLLECTION, { userId, orderBy: 'createdAt', order: 'desc', limit: 40 });
  return rows as unknown as MockupJob[];
}

async function resolveDesignUrl(userId: string, projectId: string | undefined, explicit?: string): Promise<string> {
  if (explicit?.trim()) return explicit.trim();
  const { dna } = await resolveDnaForRequest(userId, projectId);
  const fromDna = dna?.sourceAssets?.find((a) => a.url)?.url;
  if (fromDna) return fromDna;
  const jobs = await getJobsByUser(userId);
  const logo = jobs.find((j) => j.module === 'logo' && j.status === 'completed' && j.imageUrl);
  if (logo?.imageUrl) return logo.imageUrl;
  const mockups = await listMockups(userId);
  const fromMockup = mockups.find((j) => j.designUrl)?.designUrl;
  if (fromMockup) return fromMockup;
  throw new ServiceError(400, 'NO_DESIGN', 'Wähle zuerst ein Design / Logo');
}

export async function generateCompositeMockup(
  userId: string,
  input: MockupGenerateInput
): Promise<MockupJob> {
  const { dna } = await resolveDnaForRequest(userId, input.projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
  const designUrl = await resolveDesignUrl(userId, input.projectId, input.designUrl);
  const embedded = await embedDesign(designUrl);

  const job: MockupJob = {
    id: randomUUID(),
    userId,
    status: 'processing',
    category: input.category,
    colorId: input.colorId,
    modelLabel: input.modelLabel,
    placement: input.placement,
    scalePercent: input.scalePercent,
    designUrl,
    lifestyle: false,
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, job.id, job as unknown as Record<string, unknown>);

  const imageUrl = buildCompositeDataUrl({
    ...input,
    designUrl: embedded,
  });
  const stored = await uploadAssetFromDataUrl(userId, imageUrl, { folder: 'mockups' });
  job.status = 'completed';
  job.imageUrl = stored;
  job.provider = 'composite';
  job.completedAt = new Date().toISOString();
  await dsSet(COLLECTION, job.id, job as unknown as Record<string, unknown>);
  if (input.projectId && stored) {
    await attachAssetToProject(userId, input.projectId, {
      name: `Mockup ${PRODUCT_LABEL[input.category]}`,
      type: 'mockup',
      url: stored,
      jobId: job.id,
      module: 'mockup',
      sourceType: 'mockup',
      sourceId: job.id,
      mimeType: stored.includes('svg') ? 'image/svg+xml' : 'image/png',
    }).catch(() => undefined);
  }
  return job;
}

export async function generateLifestyleMockup(
  userId: string,
  projectId?: string,
  payload?: Record<string, unknown>
): Promise<{ job: MockupJob; coinsSpent: number; newBalance: number }> {
  const { dna } = await resolveDnaForRequest(userId, projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  const category = (payload?.category as MockupProductCategory) || 'mug';
  const colorId = typeof payload?.colorId === 'string' ? payload.colorId : 'white';
  let designUrl = '';
  try {
    designUrl = await resolveDesignUrl(
      userId,
      projectId,
      typeof payload?.designUrl === 'string' ? payload.designUrl : undefined
    );
  } catch (err) {
    if (!(err instanceof ServiceError && err.code === 'NO_DESIGN')) throw err;
  }

  const queued: MockupJob = {
    id: randomUUID(),
    userId,
    status: 'queued',
    category,
    colorId,
    modelLabel: PRODUCT_LABEL[category],
    placement: 'front',
    scalePercent: 100,
    designUrl,
    lifestyle: true,
    projectId,
    createdAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, queued.id, queued as unknown as Record<string, unknown>);

  try {
    const result = await withCoinCharge(userId, CoinSpendCategory.MOCKUP_GENERATION, 'Lifestyle-Mockup', async () => {
      return enqueueJob(async () => {
        queued.status = 'processing';
        await dsSet(COLLECTION, queued.id, queued as unknown as Record<string, unknown>);
        try {
          const colorLabel = colorId === 'black' ? 'black' : colorId;
          const prompt = [
            `Photorealistic product photography of a ${colorLabel} ${PRODUCT_LABEL[category]}`,
            'brand merch mockup in a cafe/lifestyle setting',
            `printed artwork is the creator logo for ${dna.name} (do not invent a different mascot)`,
            dna.primaryColors.length ? `brand colors ${dna.primaryColors.join(', ')}` : null,
            dna.locks?.colors ? 'LOCKED: do not change brand colors' : null,
            'cinematic lighting, no watermark',
          ]
            .filter(Boolean)
            .join('. ');
          const gen = await generateImage({
            module: 'ai-image',
            dna,
            customPrompt: prompt,
            size: '1024x1024',
            hd: true,
          });
          queued.status = 'completed';
          queued.imageUrl = gen.imageUrl;
          queued.provider = gen.provider;
          queued.completedAt = new Date().toISOString();
          await dsSet(COLLECTION, queued.id, queued as unknown as Record<string, unknown>);
          return queued;
        } catch (err) {
          queued.status = 'failed';
          queued.error = err instanceof Error ? err.message : 'Lifestyle-Mockup fehlgeschlagen';
          queued.completedAt = new Date().toISOString();
          await dsSet(COLLECTION, queued.id, queued as unknown as Record<string, unknown>);
          return queued;
        }
      });
    });
    if (projectId && result.job.imageUrl) {
      await attachAssetToProject(userId, projectId, {
        name: `Mockup ${PRODUCT_LABEL[category]}`,
        type: 'mockup',
        url: result.job.imageUrl,
        jobId: result.job.id,
        module: 'mockup',
        sourceType: 'mockup',
        sourceId: result.job.id,
      }).catch(() => undefined);
    }
    return result;
  } catch (err) {
    queued.status = 'failed';
    queued.error = err instanceof Error ? err.message : 'Lifestyle-Mockup fehlgeschlagen';
    queued.completedAt = new Date().toISOString();
    await dsSet(COLLECTION, queued.id, queued as unknown as Record<string, unknown>);
    if (err instanceof AppError) {
      throw new ServiceError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
}

export async function getMockup(id: string, userId: string): Promise<MockupJob | null> {
  const row = await dsGet(COLLECTION, id);
  if (!row || row.userId !== userId) return null;
  return row as unknown as MockupJob;
}

export async function saveMockupToFiles(userId: string, jobId: string) {
  const job = await getMockup(jobId, userId);
  if (!job?.imageUrl) throw new ServiceError(404, 'NOT_FOUND', 'Mockup nicht gefunden');
  const dataUrl = job.imageUrl.startsWith('data:')
    ? job.imageUrl
    : await embedDesign(job.imageUrl);
  return saveUserFile(userId, {
    name: `Mockup ${PRODUCT_LABEL[job.category]}`,
    mimeType: dataUrl.includes('svg') ? 'image/svg+xml' : 'image/png',
    category: 'other',
    dataUrl,
    source: 'generation',
  });
}

export async function saveMockupToProject(userId: string, jobId: string, projectId: string) {
  const job = await getMockup(jobId, userId);
  if (!job?.imageUrl) throw new ServiceError(404, 'NOT_FOUND', 'Mockup nicht gefunden');
  const asset = await attachAssetToProject(userId, projectId, {
    name: `Mockup ${PRODUCT_LABEL[job.category]}`,
    type: 'mockup',
    url: job.imageUrl,
    jobId: job.id,
    module: 'mockup',
    sourceType: 'mockup',
    sourceId: job.id,
  });
  const project = await getProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  return { project, asset };
}

export { PRODUCT_LABEL };
