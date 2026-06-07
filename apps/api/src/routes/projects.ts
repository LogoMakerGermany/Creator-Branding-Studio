import { Router } from 'express';
import { authMiddleware, type AuthRequest } from './auth.js';
import { getDb } from '../db/localDb.js';
import { createDefaultDNA } from '@cbs/shared';
import { extractAndSaveDNA } from '../services/dnaExtractor.js';
import { upload, validateUploadBuffer } from '../middleware/upload.js';
import { checkCopyright } from '../guards/copyrightGuard.js';
import { audit } from '../guards/fraudShield.js';
import { sanitizeInput } from '../middleware/security.js';
import { requireProjectAccess } from '../middleware/projectAccess.js';

export const projectsRouter = Router();
projectsRouter.use(authMiddleware as never);

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
