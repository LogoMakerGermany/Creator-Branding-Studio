import {
  applyLockedDnaToGeneration,
  CoinSpendCategory,
  COIN_COSTS,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_PACK_ITEMS,
  getStreamsetAsset,
  missingStreamsetLabels,
  optionsForStreamsetItem,
  pickJobForStreamsetAsset,
  resolveStreamsetAssetKey,
  streamsetAssetPresent,
  type CreatorDNA,
  type StreamsetAssetDef,
  type StreamsetGeneratorKind,
} from '@ucbs/shared';
import { resolveDnaForRequest } from './dna.service.js';
import {
  buildPromptForStudioModule,
  generateStudioAsset,
  getJobsByUser,
  runGenerationJob,
  type GenerationJob,
} from './ai.service.js';
import { withCoinChargePack } from '../lib/billable-job.js';
import { ServiceError } from '../lib/errors.js';
import { buildZipArchive, sanitizeZipEntryName, zipEntryPath } from '../lib/zip-store.js';
import { uploadAssetFromDataUrl } from '../lib/firebase-storage.js';
import { enqueueJob } from '../lib/job-queue.js';
import { getCcdPromptContext, appendCcdToPrompt } from './creator-dna-engine/index.js';

export { STREAMSET_PACK_ITEMS, STREAMSET_PACK_COIN_COST };

async function runCatalogItem(
  userId: string,
  dna: CreatorDNA,
  item: StreamsetAssetDef,
  characterDna: Parameters<typeof appendCcdToPrompt>[1],
  projectId?: string
): Promise<GenerationJob> {
  const studioOptions = applyLockedDnaToGeneration(
    dna,
    optionsForStreamsetItem(item, dna.styleDirection) as Parameters<typeof applyLockedDnaToGeneration>[1]
  );
  const built = buildPromptForStudioModule(dna, item.module, studioOptions);
  const prompt = [built.prompt, item.promptHint].filter(Boolean).join('. ');
  const enriched = appendCcdToPrompt(prompt, characterDna);
  return runGenerationJob(userId, item.module, dna, enriched, {
    size: built.size,
    hd: built.hd,
    assetKey: item.key,
    projectId,
  });
}

export async function generateStreamsetPack(
  userId: string,
  projectId?: string
): Promise<{
  jobs: GenerationJob[];
  coinsSpent: number;
  newBalance: number;
}> {
  const { dna } = await resolveDnaForRequest(userId, projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  const { characterDna } = await getCcdPromptContext(userId, projectId);

  return withCoinChargePack(userId, CoinSpendCategory.STREAMSET_PACK, 'Streamset Komplettpaket', async () => {
    return enqueueJob(async () => {
      const jobs: GenerationJob[] = [];
      for (const item of STREAMSET_PACK_ITEMS) {
        const job = await runCatalogItem(userId, dna, item, characterDna, projectId);
        jobs.push(job);
      }
      return jobs;
    });
  });
}

export async function generateStreamsetAsset(
  userId: string,
  input: { assetKey?: string; kind?: StreamsetGeneratorKind; projectId?: string }
) {
  const item = resolveStreamsetAssetKey(input.assetKey, input.kind);
  if (!item) {
    throw new ServiceError(400, 'INVALID_ASSET', 'Unbekanntes Streamset-Asset');
  }

  const { dna } = await resolveDnaForRequest(userId, input.projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  const studioOptions = optionsForStreamsetItem(item, dna.styleDirection);
  return generateStudioAsset(
    userId,
    item.module,
    item.coinCategory,
    `Streamset ${item.label}`,
    studioOptions,
    { projectId: input.projectId, assetKey: item.key }
  );
}

export async function getStreamsetStatus(userId: string, projectId?: string) {
  const resolved = await resolveDnaForRequest(userId, projectId);
  const allJobs = await getJobsByUser(userId);
  const jobs = allJobs.filter((j) => !projectId || !j.projectId || j.projectId === projectId);
  const assets = STREAMSET_PACK_ITEMS.map((item) => {
    const job = pickJobForStreamsetAsset(item, jobs);
    return {
      key: item.key,
      label: item.label,
      tab: item.tab,
      module: item.module,
      present: streamsetAssetPresent(item, jobs),
      coinCost: COIN_COSTS[item.coinCategory],
      job: job
        ? {
            id: job.id,
            status: job.status,
            imageUrl: job.imageUrl,
            error: job.error,
            assetKey: job.assetKey,
            module: job.module,
          }
        : undefined,
    };
  });

  return {
    packCoinCost: STREAMSET_PACK_COIN_COST,
    dna: resolved.dna
      ? {
          id: resolved.dna.id,
          name: resolved.dna.name,
          source: resolved.source,
          primaryColors: resolved.dna.primaryColors,
          locks: resolved.dna.locks,
          styleDirection: resolved.dna.styleDirection,
        }
      : null,
    projectName: resolved.projectName,
    assets,
    missing: missingStreamsetLabels(jobs),
    jobs: jobs.filter((j) => j.assetKey || STREAMSET_PACK_ITEMS.some((item) => item.module === j.module)),
  };
}

export function streamsetCatalogKeys(): string[] {
  return STREAMSET_PACK_ITEMS.map((item) => item.key);
}

export function requireStreamsetAsset(key: string): StreamsetAssetDef {
  const item = getStreamsetAsset(key);
  if (!item) throw new ServiceError(400, 'INVALID_ASSET', 'Unbekanntes Streamset-Asset');
  return item;
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1];
      if (!base64) return null;
      return Buffer.from(base64, 'base64');
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** ZIP of successful streamset binaries only. Missing parts are listed, not faked. */
export async function exportStreamsetZip(
  userId: string,
  projectId?: string
): Promise<{ exportUrl: string; files: number; missing: string[]; exportedAt: string }> {
  const status = await getStreamsetStatus(userId, projectId);
  const exportedAt = new Date().toISOString();
  const entries: { name: string; data: Buffer }[] = [];
  const packed: { key: string; filename: string; missing: boolean }[] = [];
  const seen = new Set<string>();

  for (const asset of status.assets) {
    const url = asset.job?.imageUrl;
    if (!url || asset.job?.status !== 'completed') {
      packed.push({ key: asset.key, filename: '', missing: true });
      continue;
    }
    if (seen.has(url)) {
      packed.push({ key: asset.key, filename: '(duplikat übersprungen)', missing: false });
      continue;
    }
    const buf = await fetchBuffer(url);
    if (!buf) {
      packed.push({ key: asset.key, filename: '', missing: true });
      continue;
    }
    seen.add(url);
    const filename = sanitizeZipEntryName(`${asset.key}.png`);
    entries.push({ name: zipEntryPath('streamset', filename), data: buf });
    packed.push({ key: asset.key, filename, missing: false });
  }

  const files = packed.filter((p) => !p.missing && p.filename && !p.filename.startsWith('(')).length;
  if (!files) {
    throw new ServiceError(400, 'STREAMSET_EXPORT_EMPTY', 'Keine erfolgreichen Streamset-Dateien zum Packen.');
  }

  entries.unshift({
    name: 'manifest.json',
    data: Buffer.from(
      JSON.stringify(
        {
          exportVersion: 1,
          kind: 'streamset',
          projectId: projectId ?? null,
          exportedAt,
          assets: packed,
        },
        null,
        2
      ),
      'utf8'
    ),
  });

  const zipBuffer = buildZipArchive(entries);
  const dataUrl = `data:application/zip;base64,${zipBuffer.toString('base64')}`;
  const exportUrl = await uploadAssetFromDataUrl(userId, dataUrl, {
    folder: 'streamset-exports',
    fileName: `streamset-${Date.now()}.zip`,
  });
  return {
    exportUrl,
    files,
    missing: packed.filter((p) => p.missing).map((p) => p.key),
    exportedAt,
  };
}
