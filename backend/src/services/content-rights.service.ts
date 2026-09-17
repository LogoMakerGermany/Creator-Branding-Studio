import { randomUUID } from 'node:crypto';
import {
  CONTENT_RIGHTS_ACK_VERSION,
  CONTENT_RIGHTS_REPORT_CATEGORIES,
  CONTENT_RIGHTS_REPORT_STATUSES,
  VOICE_CLONE_CONSENT_VERSION,
  isCurrentContentRightsAck,
  isCurrentVoiceCloneConsent,
  type ContentRightsAckRecord,
  type ContentRightsReportCategory,
  type ContentRightsReportStatus,
  type VoiceCloneConsentRecord,
} from '@ucbs/shared';
import { dsGet, dsList, dsListWhere, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { firestoreDocId } from '../lib/firestore-payload.js';
import { withDevLock } from '../lib/dev-mutex.js';
import { logEvent } from '../lib/observability.js';
import { getUserById, updateUser, type UserProfile } from './user.service.js';
import { getProject } from './project.service.js';
import { getJob } from './ai.service.js';
import { deleteUserFile, getUserFile, applyRightsTakedownFlag, getFileRecordById } from './file-cloud.service.js';

const REPORTS = 'content_rights_reports';
const TOKENISH = /sk_live|sk_test|whsec_|AIza[0-9A-Za-z_-]{20,}|Bearer\s+[A-Za-z0-9._-]{12,}|BEGIN PRIVATE KEY/i;

export const CONTENT_RIGHTS_REPORT_MESSAGE_MAX = 4000;
export const CONTENT_RIGHTS_REPORT_MESSAGE_MIN = 8;
export const CONTENT_RIGHTS_REPORT_MAX_PER_WINDOW = process.env.NODE_TEST === '1' ? 3 : 8;
export const CONTENT_RIGHTS_REPORT_WINDOW_MS = 60 * 60 * 1000;
export const CONTENT_RIGHTS_CONTACT_MAX = 120;

export interface ContentRightsReport {
  id: string;
  reporterUserId: string;
  reporterContact?: string;
  category: ContentRightsReportCategory;
  description: string;
  projectId?: string;
  fileId?: string;
  jobId?: string;
  createdAt: string;
  updatedAt: string;
  status: ContentRightsReportStatus;
  adminNotes?: string;
  takedownFileId?: string;
  takedownAt?: string;
}

export interface PublicContentRightsReport {
  id: string;
  category: ContentRightsReportCategory;
  description: string;
  projectId?: string;
  fileId?: string;
  jobId?: string;
  createdAt: string;
  status: ContentRightsReportStatus;
}

function asPlainText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

function requirePlainText(value: string, label: string, min: number, max: number): string {
  if (value.length > max) {
    throw new ServiceError(400, 'VALIDATION_ERROR', `${label} ist zu lang`);
  }
  const cleaned = asPlainText(value, max);
  if (cleaned.length < min) {
    throw new ServiceError(400, 'VALIDATION_ERROR', `${label} ist zu kurz`);
  }
  return cleaned;
}

function optionalContextId(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  const cleaned = asPlainText(value, 80);
  if (!cleaned) return undefined;
  try {
    return firestoreDocId(cleaned);
  } catch {
    throw new ServiceError(400, 'VALIDATION_ERROR', `${field} ungültig`);
  }
}

function normalizeReport(raw: Record<string, unknown>): ContentRightsReport {
  const category = CONTENT_RIGHTS_REPORT_CATEGORIES.includes(raw.category as ContentRightsReportCategory)
    ? (raw.category as ContentRightsReportCategory)
    : 'OTHER';
  const status = CONTENT_RIGHTS_REPORT_STATUSES.includes(raw.status as ContentRightsReportStatus)
    ? (raw.status as ContentRightsReportStatus)
    : 'OPEN';
  return {
    id: String(raw.id),
    reporterUserId: String(raw.reporterUserId ?? ''),
    reporterContact: raw.reporterContact ? String(raw.reporterContact) : undefined,
    category,
    description: String(raw.description ?? ''),
    projectId: raw.projectId ? String(raw.projectId) : undefined,
    fileId: raw.fileId ? String(raw.fileId) : undefined,
    jobId: raw.jobId ? String(raw.jobId) : undefined,
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? ''),
    status,
    adminNotes: raw.adminNotes ? String(raw.adminNotes) : undefined,
    takedownFileId: raw.takedownFileId ? String(raw.takedownFileId) : undefined,
    takedownAt: raw.takedownAt ? String(raw.takedownAt) : undefined,
  };
}

export function toPublicRightsReport(row: ContentRightsReport): PublicContentRightsReport {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    projectId: row.projectId,
    fileId: row.fileId,
    jobId: row.jobId,
    createdAt: row.createdAt,
    status: row.status,
  };
}

export function toAdminRightsReport(row: ContentRightsReport): ContentRightsReport {
  return row;
}

function logRightsAction(action: string, fields: { userId?: string; reportId?: string; category?: string }): void {
  logEvent({
    level: 'info',
    ts: new Date().toISOString(),
    event: 'content_rights',
    code: action,
    message: [fields.reportId, fields.userId, fields.category, action].filter(Boolean).join(' '),
  });
}

export async function recordContentRightsAck(userId: string): Promise<ContentRightsAckRecord> {
  const user = await getUserById(userId);
  if (!user) throw new ServiceError(404, 'NOT_FOUND', 'Nutzer nicht gefunden');
  const ack: ContentRightsAckRecord = {
    version: CONTENT_RIGHTS_ACK_VERSION,
    acceptedAt: new Date().toISOString(),
  };
  await updateUser(userId, { contentRightsAck: ack });
  logRightsAction('ack', { userId, category: CONTENT_RIGHTS_ACK_VERSION });
  return ack;
}

export async function recordVoiceCloneConsent(
  userId: string,
  statement: 'own' | 'authorized'
): Promise<VoiceCloneConsentRecord> {
  const user = await getUserById(userId);
  if (!user) throw new ServiceError(404, 'NOT_FOUND', 'Nutzer nicht gefunden');
  if (statement !== 'own' && statement !== 'authorized') {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Voice-Consent ungültig');
  }
  const consent: VoiceCloneConsentRecord = {
    version: VOICE_CLONE_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    statement,
  };
  await updateUser(userId, { voiceCloneConsent: consent });
  logRightsAction('voice_consent', { userId, category: statement });
  return consent;
}

export async function assertCurrentContentRightsAck(userId: string): Promise<UserProfile> {
  const user = await getUserById(userId);
  if (!user || !isCurrentContentRightsAck(user.contentRightsAck)) {
    throw new ServiceError(
      403,
      'RIGHTS_ACK_REQUIRED',
      'Bitte bestätige, dass du die erforderlichen Rechte oder Erlaubnisse für die bereitgestellten Inhalte besitzt.'
    );
  }
  return user;
}

export async function assertVoiceCloneConsent(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user || !isCurrentVoiceCloneConsent(user.voiceCloneConsent)) {
    throw new ServiceError(
      403,
      'VOICE_CLONE_CONSENT_REQUIRED',
      'Voice-Cloning braucht eine explizite Bestätigung: eigene Stimme oder erforderliche Einwilligung.'
    );
  }
}

async function assertOwnedRefs(
  userId: string,
  refs: { projectId?: string; jobId?: string; fileId?: string }
): Promise<void> {
  if (refs.projectId) {
    const project = await getProject(refs.projectId, userId);
    if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }
  if (refs.jobId) {
    const job = await getJob(refs.jobId);
    if (!job || job.userId !== userId) throw new ServiceError(404, 'NOT_FOUND', 'Job nicht gefunden');
  }
  if (refs.fileId) {
    const file = await getUserFile(refs.fileId, userId);
    if (!file) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  }
}

export async function submitContentRightsReport(
  userId: string,
  input: {
    category: string;
    description: string;
    reporterContact?: string;
    projectId?: string;
    fileId?: string;
    jobId?: string;
  }
): Promise<ContentRightsReport> {
  return withDevLock(`content-rights-report:${userId}`, async () => {
    if (!CONTENT_RIGHTS_REPORT_CATEGORIES.includes(input.category as ContentRightsReportCategory)) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Ungültige Meldekategorie');
    }
    const description = requirePlainText(
      input.description,
      'Beschreibung',
      CONTENT_RIGHTS_REPORT_MESSAGE_MIN,
      CONTENT_RIGHTS_REPORT_MESSAGE_MAX
    );
    if (TOKENISH.test(description) || (input.reporterContact && TOKENISH.test(input.reporterContact))) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Bitte keine Zugangsdaten in Meldungen senden');
    }
    const reporterContact = input.reporterContact
      ? asPlainText(input.reporterContact, CONTENT_RIGHTS_CONTACT_MAX) || undefined
      : undefined;
    const projectId = optionalContextId(input.projectId, 'projectId');
    const jobId = optionalContextId(input.jobId, 'jobId');
    const fileId = optionalContextId(input.fileId, 'fileId');
    await assertOwnedRefs(userId, { projectId, jobId, fileId });

    const ownRaw = await dsListWhere(REPORTS, { reporterUserId: userId });
    const nowMs = Date.now();
    const windowed = ownRaw.filter((row) => nowMs - Date.parse(String(row.createdAt ?? '')) < CONTENT_RIGHTS_REPORT_WINDOW_MS);
    if (windowed.length >= CONTENT_RIGHTS_REPORT_MAX_PER_WINDOW) {
      throw new ServiceError(429, 'RATE_LIMIT', 'Zu viele Meldungen. Bitte später erneut versuchen.');
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    firestoreDocId(id);
    const row: ContentRightsReport = {
      id,
      reporterUserId: userId,
      reporterContact,
      category: input.category as ContentRightsReportCategory,
      description,
      projectId,
      fileId,
      jobId,
      createdAt: now,
      updatedAt: now,
      status: 'OPEN',
    };
    await dsSet(REPORTS, id, row as unknown as Record<string, unknown>);
    logRightsAction('report_create', { userId, reportId: id, category: row.category });
    return row;
  });
}

export async function getContentRightsReport(id: string): Promise<ContentRightsReport | null> {
  const raw = await dsGet(REPORTS, firestoreDocId(id));
  if (!raw) return null;
  return normalizeReport(raw);
}

export async function assertRightsReportReadable(row: ContentRightsReport, userId: string, isAdmin: boolean): Promise<void> {
  if (isAdmin) return;
  if (row.reporterUserId !== userId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Meldung nicht gefunden');
  }
}

export async function listOwnContentRightsReports(userId: string): Promise<PublicContentRightsReport[]> {
  const rows = (await dsListWhere(REPORTS, { reporterUserId: userId })).map((row) => normalizeReport(row));
  return rows.map(toPublicRightsReport);
}

export async function listContentRightsReportsForAdmin(limit = 50): Promise<ContentRightsReport[]> {
  const rows = (await dsList(REPORTS, { orderBy: 'createdAt', order: 'desc', limit })).map((row) =>
    normalizeReport(row)
  );
  return rows;
}

const ALLOWED_STATUS: Record<ContentRightsReportStatus, ContentRightsReportStatus[]> = {
  OPEN: ['REVIEWING', 'REJECTED', 'CLOSED'],
  REVIEWING: ['ACTIONED', 'REJECTED', 'CLOSED', 'OPEN'],
  ACTIONED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CLOSED: [],
};

export async function updateContentRightsReportStatus(
  id: string,
  status: ContentRightsReportStatus,
  adminNotes?: string
): Promise<ContentRightsReport> {
  const row = await getContentRightsReport(id);
  if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Meldung nicht gefunden');
  if (row.status !== status && !ALLOWED_STATUS[row.status].includes(status)) {
    throw new ServiceError(409, 'INVALID_STATUS', 'Ungültiger Statuswechsel');
  }
  const notes = adminNotes ? asPlainText(adminNotes, 2000) : row.adminNotes;
  const updated: ContentRightsReport = {
    ...row,
    status,
    adminNotes: notes,
    updatedAt: new Date().toISOString(),
  };
  await dsSet(REPORTS, row.id, updated as unknown as Record<string, unknown>);
  logRightsAction('report_status', { reportId: row.id, category: status });
  return updated;
}

export async function adminTakedownReportedFile(adminUserId: string, reportId: string): Promise<ContentRightsReport> {
  const row = await getContentRightsReport(reportId);
  if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Meldung nicht gefunden');
  if (!row.fileId) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Diese Meldung hat keine Datei-Referenz');
  }
  if (row.status === 'OPEN') {
    throw new ServiceError(409, 'REVIEW_REQUIRED', 'Takedown erst nach Admin-Review');
  }

  const file = await getFileRecordById(row.fileId);
  if (!file) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');

  await applyRightsTakedownFlag(file.id, file.userId);
  try {
    await deleteUserFile(file.id, file.userId);
  } catch (err) {
    if (!(err instanceof ServiceError && (err.code === 'DELETE_BLOCKED' || err.code === 'DELETE_INCOMPLETE'))) {
      throw err;
    }
  }

  const updated: ContentRightsReport = {
    ...row,
    status: 'ACTIONED',
    takedownFileId: file.id,
    takedownAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    adminNotes: row.adminNotes,
  };
  await dsSet(REPORTS, row.id, updated as unknown as Record<string, unknown>);
  logRightsAction('takedown', { userId: adminUserId, reportId: row.id, category: row.category });
  return updated;
}
