import type { Response } from 'express';
import type { Project } from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import type { AuthRequest } from '../auth/index.js';

function isStaff(user: AuthRequest['user']): boolean {
  return user?.role === 'admin' || user?.role === 'moderator';
}

export async function loadProjectForUser(
  projectId: string,
  user: AuthRequest['user'],
): Promise<Project | null> {
  const db = await getDb();
  const project = await db.getProject(projectId);
  if (!project) return null;
  if (!isStaff(user) && project.userId !== user?.id) return null;
  return project;
}

export async function requireProjectAccess(
  req: AuthRequest,
  res: Response,
): Promise<Project | null> {
  if (!req.user) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return null;
  }

  const project = await loadProjectForUser(req.params.id, req.user);
  if (!project) {
    res.status(req.params.id ? 404 : 400).json({ error: 'Projekt nicht gefunden' });
    return null;
  }

  return project;
}
