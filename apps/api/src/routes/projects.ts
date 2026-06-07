import { Router } from 'express';
import { authMiddleware, type AuthRequest } from './auth.js';
import { getDb } from '../db/localDb.js';
import { createDefaultDNA } from '@cbs/shared';
import {
  type WizardPayload,
} from '@cbs/shared';
import { extractAndSaveDNA } from '../services/dnaExtractor.js';
import { getStreamSetPreview } from '../services/streamPackService.js';
import { applyWizardToDna } from '../services/brandingDnaService.js';
import {
  getBrandingAnalyzePreview,
  startBrandingPack,
  getBrandingPackProgress,
  regenerateBrandingAssets,
  listBrandingCategories,
} from '../services/brandingPackService.js';
import { upload, validateUploadBuffer } from '../middleware/upload.js';
import { checkCopyright } from '../guards/copyrightGuard.js';
import { audit } from '../guards/fraudShield.js';
import { sanitizeInput } from '../middleware/security.js';
import { requireProjectAccess } from '../middleware/projectAccess.js';

export const projectsRouter = Router();
projectsRouter.use(authMiddleware as never);

projectsRouter.get('/stream-set/preview', (req, res) => {
  const platform = String(req.query.platform || 'tiktok');
  res.json(getStreamSetPreview(platform));
});

projectsRouter.post('/branding/analyze', (req: AuthRequest, res) => {
  try {
    const payload = req.body as WizardPayload;
    if (!payload.creatorName?.trim()) {
      return res.status(400).json({ error: 'Creator Name erforderlich' });
    }
    const enabledSlots = Array.isArray(req.body.enabledSlots) ? req.body.enabledSlots as string[] : undefined;
    res.json(getBrandingAnalyzePreview(payload, enabledSlots));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Analyse fehlgeschlagen' });
  }
});

projectsRouter.post('/branding/preview', (req: AuthRequest, res) => {
  try {
    const payload = req.body as WizardPayload;
    const enabledSlots = Array.isArray(req.body.enabledSlots) ? req.body.enabledSlots as string[] : undefined;
    res.json(getBrandingAnalyzePreview(payload, enabledSlots));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Vorschau fehlgeschlagen' });
  }
});

projectsRouter.post('/wizard', async (req: AuthRequest, res) => {
  try {
    const payload = req.body as WizardPayload & { enabledSlots?: string[]; startGeneration?: boolean };
    const creatorName = sanitizeInput(payload.creatorName || 'Creator');
    const copyright = await checkCopyright(creatorName, req.user!.id);
    if (copyright.blocked) return res.status(422).json({ error: copyright.reason });

    const db = await getDb();
    const now = new Date().toISOString();
    const project = await db.createProject({
      id: crypto.randomUUID(),
      userId: req.user!.id,
      name: creatorName,
      description: payload.slogan ? sanitizeInput(payload.slogan) : undefined,
      createdAt: now,
      updatedAt: now,
    });

    const dna = applyWizardToDna(project.id, payload);
    await db.saveDNA(dna);

    const preview = getBrandingAnalyzePreview(payload, payload.enabledSlots);
    let packId: string | undefined;

    if (payload.startGeneration === true) {
      const started = await startBrandingPack(
        project.id,
        req.user!.id,
        req.ip,
        payload.platform,
        payload.enabledSlots,
      );
      packId = started.packId;
    }

    await audit(db, req.user!.id, 'wizard_create', project.id, payload.platform, req.ip);
    res.status(201).json({ project, packId, preview });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Wizard fehlgeschlagen' });
  }
});

projectsRouter.get('/', async (req: AuthRequest, res) => {
  const db = await getDb();
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'moderator';
  const projects = await db.listProjects(isAdmin ? undefined : req.user!.id);
  res.json(projects);
});

projectsRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const name = sanitizeInput(req.body.name || 'Neues Projekt');
    const copyright = await checkCopyright(name, req.user!.id);
    if (copyright.blocked) return res.status(422).json({ error: copyright.reason });

    const db = await getDb();
    const now = new Date().toISOString();
    const project = await db.createProject({
      id: crypto.randomUUID(),
      userId: req.user!.id,
      name,
      description: req.body.description,
      createdAt: now,
      updatedAt: now,
    });
    const dna = createDefaultDNA(project.id, name);
    await db.saveDNA(dna);
    await audit(db, req.user!.id, 'create_project', project.id, name, req.ip);
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Fehler' });
  }
});

projectsRouter.get('/:id', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;
  res.json(project);
});

projectsRouter.delete('/:id', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const db = await getDb();
  await db.deleteProject(project.id);
  res.json({ ok: true });
});

projectsRouter.get('/:id/dna', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const db = await getDb();
  const dna = await db.getDNA(project.id);
  if (!dna) return res.status(404).json({ error: 'DNA nicht gefunden' });
  res.json(dna);
});

projectsRouter.put('/:id/dna', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const db = await getDb();
  const existing = await db.getDNA(project.id);
  if (!existing) return res.status(404).json({ error: 'DNA nicht gefunden' });
  const updated = { ...existing, ...req.body, projectId: project.id, updatedAt: new Date().toISOString() };
  await db.saveDNA(updated);
  res.json(updated);
});

projectsRouter.post('/:id/dna/styles', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const db = await getDb();
  const dna = await db.getDNA(project.id);
  if (!dna) return res.status(404).json({ error: 'DNA nicht gefunden' });
  const name = sanitizeInput(req.body.name || `Stil ${(dna.savedStyleProfiles?.length || 0) + 1}`);
  const profile = {
    id: crypto.randomUUID(),
    name,
    brandingStyle: dna.brandingStyle,
    primaryColors: [...dna.primaryColors],
    accentColors: [...dna.accentColors],
    glowStrength: dna.glowStrength,
    neonStrength: dna.neonStrength,
    savedAt: new Date().toISOString(),
  };
  const profiles = [...(dna.savedStyleProfiles || []), profile];
  const updated = { ...dna, savedStyleProfiles: profiles, updatedAt: new Date().toISOString() };
  await db.saveDNA(updated);
  res.status(201).json(profile);
});

projectsRouter.post('/:id/dna/styles/:styleId/apply', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const db = await getDb();
  const dna = await db.getDNA(project.id);
  if (!dna) return res.status(404).json({ error: 'DNA nicht gefunden' });
  const profile = dna.savedStyleProfiles?.find(s => s.id === req.params.styleId);
  if (!profile) return res.status(404).json({ error: 'Stilprofil nicht gefunden' });
  const updated = {
    ...dna,
    brandingStyle: profile.brandingStyle,
    primaryColors: [...profile.primaryColors],
    accentColors: [...profile.accentColors],
    glowStrength: profile.glowStrength,
    neonStrength: profile.neonStrength,
    activeStyleProfileId: profile.id,
    updatedAt: new Date().toISOString(),
  };
  await db.saveDNA(updated);
  res.json(updated);
});

projectsRouter.post('/:id/dna/extract', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const project = await requireProjectAccess(req, res);
    if (!project) return;

    const name = req.body.name ? sanitizeInput(req.body.name) : undefined;
    let imageBuffer: Buffer | undefined;
    let mimeType: string | undefined;

    if (req.file) {
      const valid = await validateUploadBuffer(req.file.buffer);
      if (!valid) return res.status(400).json({ error: 'Ungültiger Dateityp' });
      imageBuffer = req.file.buffer;
      mimeType = req.file.mimetype;
      const copyright = await checkCopyright(name || 'upload', req.user!.id, project.id);
      if (copyright.blocked) return res.status(422).json({ error: copyright.reason });
    }

    if (!name && !imageBuffer) {
      return res.status(400).json({ error: 'Name oder Logo erforderlich' });
    }

    const dna = await extractAndSaveDNA(project.id, { name, imageBuffer, mimeType });
    res.json(dna);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'DNA-Extraktion fehlgeschlagen' });
  }
});

projectsRouter.get('/:id/jobs', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const db = await getDb();
  res.json(await db.listJobs(project.id));
});

projectsRouter.get('/:id/jobs/:jobId', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const db = await getDb();
  const job = await db.getJob(req.params.jobId);
  if (!job || job.projectId !== project.id) {
    return res.status(404).json({ error: 'Job nicht gefunden' });
  }
  res.json(job);
});

projectsRouter.get('/:id/branding/categories', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const db = await getDb();
  const dna = await db.getDNA(project.id);
  const platform = String(req.query.platform || dna?.platformPreferences?.[0] || 'tiktok');
  res.json(listBrandingCategories(platform));
});

projectsRouter.post('/:id/branding/generate', async (req: AuthRequest, res) => {
  try {
    const project = await requireProjectAccess(req, res);
    if (!project) return;

    const db = await getDb();
    const dna = await db.getDNA(project.id);
    const platform = String(req.body.platform || dna?.platformPreferences?.[0] || 'tiktok');
    const enabledSlots = Array.isArray(req.body.enabledSlots) ? req.body.enabledSlots as string[] : undefined;

    const { packId, totalCoins } = await startBrandingPack(
      project.id,
      req.user!.id,
      req.ip,
      platform,
      enabledSlots,
    );
    res.status(202).json({ packId, totalCoins });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Generierung fehlgeschlagen' });
  }
});

projectsRouter.get('/:id/branding/:packId', async (req: AuthRequest, res) => {
  const project = await requireProjectAccess(req, res);
  if (!project) return;

  const progress = getBrandingPackProgress(req.params.packId, project.id);
  if (!progress) return res.status(404).json({ error: 'Branding-Pack nicht gefunden' });
  res.json(progress);
});

projectsRouter.post('/:id/branding/regenerate', async (req: AuthRequest, res) => {
  try {
    const project = await requireProjectAccess(req, res);
    if (!project) return;

    const db = await getDb();
    const dna = await db.getDNA(project.id);
    const platform = String(req.body.platform || dna?.platformPreferences?.[0] || 'tiktok');

    const { packId } = await regenerateBrandingAssets(
      project.id,
      req.user!.id,
      req.ip,
      platform,
      {
        slots: req.body.slots,
        category: req.body.category,
      },
    );
    res.status(202).json({ packId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Regenerierung fehlgeschlagen' });
  }
});
