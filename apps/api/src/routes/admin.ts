import { Router } from 'express';
import { authMiddleware, requireRole, type AuthRequest } from './auth.js';
import { getDb } from '../db/localDb.js';

export const adminRouter = Router();
adminRouter.use(authMiddleware as never);
adminRouter.use(requireRole('admin', 'moderator') as never);

adminRouter.get('/users', async (_req, res) => {
  const db = await getDb();
  res.json(await db.listUsers());
});

adminRouter.patch('/users/:id', async (req, res) => {
  const db = await getDb();
  const user = await db.updateUser(req.params.id, req.body);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  res.json(user);
});

adminRouter.get('/projects', async (_req, res) => {
  const db = await getDb();
  res.json(await db.listProjects());
});

adminRouter.delete('/projects/:id', async (req, res) => {
  const db = await getDb();
  await db.deleteProject(req.params.id);
  res.json({ ok: true });
});

adminRouter.get('/logs/audit', async (_req, res) => {
  const db = await getDb();
  res.json(await db.listAuditLogs());
});

adminRouter.get('/logs/copyright', async (_req, res) => {
  const db = await getDb();
  res.json(await db.listCopyrightLogs());
});

adminRouter.get('/logs/security', async (_req, res) => {
  const db = await getDb();
  res.json(await db.listSecurityEvents());
});

adminRouter.get('/logs/errors', async (_req, res) => {
  const db = await getDb();
  res.json(await db.listFailedJobs());
});

adminRouter.get('/api-usage', async (_req, res) => {
  const db = await getDb();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  res.json(await db.countJobsByProvider(since));
});

adminRouter.get('/stats', async (_req: AuthRequest, res) => {
  const db = await getDb();
  const [users, projects, audit, security, failed] = await Promise.all([
    db.listUsers(),
    db.listProjects(),
    db.listAuditLogs(10),
    db.listSecurityEvents(10),
    db.listFailedJobs(10),
  ]);
  res.json({
    userCount: users.length,
    projectCount: projects.length,
    recentAudit: audit,
    recentSecurity: security,
    recentErrors: failed,
  });
});
