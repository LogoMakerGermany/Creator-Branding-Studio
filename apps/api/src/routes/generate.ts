import { Router } from 'express';
import { ASSET_TYPES } from '@cbs/shared';
import type { AssetType } from '@cbs/shared';
import { authMiddleware, type AuthRequest } from './auth.js';
import { runGeneration } from '../services/dnaExtractor.js';
import { startStreamPack, getStreamPackProgress, generateStickers, getStreamSetPreview } from '../services/streamPackService.js';
import { createZipDownload, createStickerZip, createObsExport, getAssetFile, createBrandingPackZip } from '../services/downloadService.js';
import { requireProjectAccess } from '../middleware/projectAccess.js';
import { existsSync } from 'fs';

export const generateRouter = Router();
generateRouter.use(authMiddleware as never);

generateRouter.post('/:id/generate/:assetType', async (req: AuthRequest, res) => {
  try {
    const project = await requireProjectAccess(req, res);
    if (!project) return;

    const assetType = req.params.assetType as AssetType;
    if (!ASSET_TYPES.includes(assetType)) {
      return res.status(400).json({ error: 'Unbekannter Asset-Typ' });
    }
    const { jobId } = await runGeneration(project.id, assetType, req.body, req.user!.id, req.ip);
    res.status(202).json({ jobId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Generierung fehlgeschlagen' });
  }
});

generateRouter.get('/:id/stream-set/preview', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;
  const platform = String(req.query.platform || 'tiktok');
  res.json(getStreamSetPreview(platform));
});

generateRouter.post('/:id/stream-pack', async (req: AuthRequest, res) => {
  try {
    const project = await requireProjectAccess(req, res);
    if (!project) return;

    const { packId } = await startStreamPack(project.id, req.user!.id, req.ip, req.body.platform);
    res.status(202).json({ packId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Fehler' });
  }
});

generateRouter.get('/:id/stream-pack/:packId', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const progress = getStreamPackProgress(req.params.packId, project.id);
  if (!progress) return res.status(404).json({ error: 'Pack nicht gefunden' });
  res.json(progress);
});

generateRouter.post('/:id/stickers', async (req: AuthRequest, res) => {
  try {
    const project = await requireProjectAccess(req, res);
    if (!project) return;

    const { stickerTexts = [] } = req.body;
    const { jobIds } = await generateStickers(project.id, stickerTexts, req.user!.id, req.ip, req.body.platform);
    res.status(202).json({ jobIds });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Sticker-Generierung fehlgeschlagen' });
  }
});

generateRouter.post('/:id/animations', async (req: AuthRequest, res) => {
  try {
    const project = await requireProjectAccess(req, res);
    if (!project) return;

    const assetType = (req.body.assetType || 'intro') as AssetType;
    const { jobId } = await runGeneration(project.id, assetType, {
      duration: req.body.duration || 5,
      customText: req.body.customText,
      platform: req.body.platform,
    }, req.user!.id, req.ip);
    res.status(202).json({ jobId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Animation fehlgeschlagen' });
  }
});

generateRouter.get('/:id/downloads/branding-pack', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;
  await createBrandingPackZip(project.id, res);
});

generateRouter.get('/:id/downloads/zip', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;
  await createZipDownload(project.id, res);
});

generateRouter.get('/:id/downloads/stickers-zip', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;
  await createStickerZip(project.id, res);
});

generateRouter.get('/:id/downloads/obs', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;
  await createObsExport(project.id, res);
});

generateRouter.get('/:id/assets/:fileName', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const buffer = getAssetFile(project.id, req.params.fileName);
  if (!buffer) return res.status(404).json({ error: 'Datei nicht gefunden' });
  const ext = req.params.fileName.split('.').pop();
  const mime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : 'image/png';
  res.setHeader('Content-Type', mime);
  res.send(buffer);
});

generateRouter.get('/:id/assets', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const db = await (await import('../db/localDb.js')).getDb();
  const jobs = (await db.listJobs(project.id)).filter(j => j.status === 'done' && j.filePath && existsSync(j.filePath));
  res.json(jobs);
});
