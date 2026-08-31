import type { CreatorDNA, Project, ProjectAsset, ProjectExportManifest, ProjectExportAssetMeta } from '@ucbs/shared';
import { getProject } from './project.service.js';
import { getDnaById } from './dna.service.js';
import { getJobsByUser } from './ai.service.js';
import { listUserFiles, type UserFile } from './file-cloud.service.js';
import { listTextJobs, contentPackageExportText } from './text.service.js';
import { buildZipArchive, sanitizeZipEntryName, zipEntryPath } from '../lib/zip-store.js';
import { uploadAssetFromDataUrl } from '../lib/firebase-storage.js';

async function fetchAssetBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1];
      if (!base64) return null;
      return Buffer.from(base64, 'base64');
    }
    if (url.startsWith('content:')) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function extensionFromUrl(url: string, mime?: string, fallback = 'bin'): string {
  if (mime?.includes('png') || url.startsWith('data:image/png')) return 'png';
  if (mime?.includes('jpeg') || url.startsWith('data:image/jpeg')) return 'jpg';
  if (mime?.includes('svg') || url.startsWith('data:image/svg')) return 'svg';
  if (mime?.includes('mp4') || url.startsWith('data:video/mp4')) return 'mp4';
  if (mime?.includes('text')) return 'txt';
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match?.[1] ?? fallback;
  } catch {
    return fallback;
  }
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    txt: 'text/plain',
    json: 'application/json',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * Brand-project ZIP: only this project's assets/files/outputs. Deduped. Missing marked, not faked.
 */
export async function exportProjectZip(
  id: string,
  userId: string
): Promise<{
  project: Project;
  exportUrl: string;
  assets: ProjectAsset[];
  fileCount: number;
  missingCount: number;
  exportedAt: string;
  manifest: ProjectExportManifest;
}> {
  const project = await getProject(id, userId);
  if (!project) throw new Error('Projekt nicht gefunden');

  const exportedAt = new Date().toISOString();
  const entries: { name: string; data: Buffer }[] = [];
  const seen = new Set<string>();
  const assetMeta: ProjectExportAssetMeta[] = [];
  let fileCount = 0;
  let missingCount = 0;

  let dna: CreatorDNA | null = null;
  if (project.dnaId) {
    dna = await getDnaById(project.dnaId, userId);
  }

  const [jobs, files, textJobs] = await Promise.all([
    getJobsByUser(userId),
    listUserFiles(userId, { projectId: id }),
    listTextJobs(userId),
  ]);

  const packBinary = async (
    key: string,
    folder: string,
    filename: string,
    url: string,
    meta: Omit<ProjectExportAssetMeta, 'filename' | 'missing'> & { missing?: boolean }
  ) => {
    if (seen.has(key) || seen.has(url)) {
      assetMeta.push({ ...meta, filename: '', missing: false });
      return;
    }
    const buf = await fetchAssetBuffer(url);
    if (!buf) {
      missingCount++;
      assetMeta.push({ ...meta, filename: '', missing: true });
      return;
    }
    seen.add(key);
    seen.add(url);
    const safe = zipEntryPath(folder, filename);
    entries.push({ name: safe, data: buf });
    fileCount++;
    assetMeta.push({ ...meta, filename: safe, missing: false });
  };

  for (const asset of project.assets) {
    const ext = extensionFromUrl(asset.url, asset.mimeType);
    const filename = `${sanitizeZipEntryName(asset.name || asset.id)}.${ext}`;
    if (asset.url.startsWith('content:')) {
      const pkgId = asset.url.slice('content:'.length);
      const pkg = textJobs.find((t) => t.id === pkgId && t.userId === userId);
      if (pkg) {
        const txtName = zipEntryPath('content', `${sanitizeZipEntryName(pkg.title || pkg.id)}.txt`);
        if (!seen.has(pkg.id)) {
          entries.push({ name: txtName, data: Buffer.from(contentPackageExportText(pkg), 'utf8') });
          seen.add(pkg.id);
          fileCount++;
          assetMeta.push({
            id: asset.id,
            name: asset.name,
            type: asset.type,
            module: asset.module,
            version: asset.version,
            mimeType: 'text/plain',
            source: 'content',
            filename: txtName,
            missing: false,
            jobId: asset.jobId,
            fileId: asset.fileId,
          });
        }
      } else {
        missingCount++;
        assetMeta.push({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          module: asset.module,
          version: asset.version,
          source: 'content',
          filename: '',
          missing: true,
        });
      }
      continue;
    }
    await packBinary(asset.jobId || asset.fileId || asset.url, 'assets', filename, asset.url, {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      module: asset.module,
      version: asset.version,
      mimeType: asset.mimeType || mimeFromExt(ext),
      source: asset.sourceType || 'project-asset',
      jobId: asset.jobId,
      fileId: asset.fileId,
    });
  }

  for (const job of jobs) {
    if (job.projectId !== id || job.status !== 'completed' || !job.imageUrl) continue;
    const ext = extensionFromUrl(job.imageUrl);
    await packBinary(job.id, 'jobs', `${sanitizeZipEntryName(job.assetKey || job.module)}-${job.id.slice(0, 8)}.${ext}`, job.imageUrl, {
      id: job.id,
      name: job.assetKey || job.module,
      type: job.module,
      module: job.module,
      version: 1,
      mimeType: mimeFromExt(ext),
      source: 'generation-job',
      jobId: job.id,
    });
  }

  for (const file of files) {
    if (!file.downloadUrl) continue;
    const ext = extensionFromUrl(file.downloadUrl, file.mimeType);
    await packBinary(file.id, 'files', `${sanitizeZipEntryName(file.name)}.${ext}`, file.downloadUrl, {
      id: file.id,
      name: file.name,
      type: file.category,
      module: file.category,
      version: 1,
      mimeType: file.mimeType,
      source: 'file-cloud',
      fileId: file.id,
    });
  }

  if (dna) {
    const sources = dna.sourceAssets ?? [];
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      if (!src.url) continue;
      const ext = extensionFromUrl(src.url);
      await packBinary(`dna-${i}-${src.url}`, 'dna', `${src.type || 'reference'}-${i + 1}.${ext}`, src.url, {
        id: `dna-${i}`,
        name: src.type || 'dna-reference',
        type: 'dna',
        version: dna.version ?? 1,
        source: 'dna',
      });
    }
  }

  const manifest: ProjectExportManifest = {
    exportVersion: 1,
    projectId: project.id,
    projectName: project.name,
    projectType: project.type,
    exportedAt,
    dna: dna ? { id: dna.id, name: dna.name, version: dna.version } : null,
    assets: assetMeta,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      type: project.type,
      status: project.status,
      dnaId: project.dnaId,
      assets: project.assets,
    },
  };

  entries.unshift({
    name: 'manifest.json',
    data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
  });
  fileCount++;

  const zipBuffer = buildZipArchive(entries);
  const dataUrl = `data:application/zip;base64,${zipBuffer.toString('base64')}`;
  const exportUrl = await uploadAssetFromDataUrl(userId, dataUrl, {
    folder: 'project-exports',
    fileName: `${sanitizeZipEntryName(project.id)}-${Date.now()}.zip`,
  });

  return {
    project,
    exportUrl,
    assets: project.assets,
    fileCount,
    missingCount,
    exportedAt,
    manifest,
  };
}

export type { UserFile };
