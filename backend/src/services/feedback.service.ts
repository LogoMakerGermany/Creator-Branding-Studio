import { randomUUID } from 'node:crypto';
import { dsGet, dsList, dsListWhere, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { isSafeClientRequestId } from '../lib/observability.js';
import { withDevLock } from '../lib/dev-mutex.js';
import { firestoreDocId } from '../lib/firestore-payload.js';
import {
  MAX_FEEDBACK_SCREENSHOT_CHARS,
  parseAndValidateFeedbackScreenshot,
} from '../lib/upload-validation.js';
import {
  deleteOwnedStorageObject,
  isOwnedStoragePath,
  signOwnedStoragePath,
  SIGNED_URL_TTL_MS,
  uploadAssetFromBuffer,
} from '../lib/firebase-storage.js';
import { getProject } from './project.service.js';
import { getJob } from './ai.service.js';
import { getUserFile } from './file-cloud.service.js';

export const FEEDBACK_TYPES = ['bug', 'feedback', 'feature_request', 'support'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_CATEGORIES = [
  'bug',
  'usability',
  'generation',
  'payment',
  'coins',
  'file',
  'account',
  'technical',
  'suggestion',
  'other',
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ['new', 'reviewing', 'resolved', 'closed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface TesterFeedback {
  id: string;
  userId: string;
  type: FeedbackType;
  module: string;
  route?: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  subject: string;
  message: string;
  projectId?: string;
  jobId?: string;
  fileId?: string;
  requestId?: string;
  idempotencyKey?: string;
  screenshotDataUrl?: string;
  screenshotStoragePath?: string;
  createdAt: string;
  updatedAt: string;
}

export type SafeFeedback = Omit<TesterFeedback, 'screenshotDataUrl' | 'screenshotStoragePath'> & {
  hasScreenshot: boolean;
};

const COLLECTION = 'testerFeedback';
export const FEEDBACK_SUBJECT_MAX = 120;
export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_MESSAGE_MIN = 3;
export const FEEDBACK_LIST_DEFAULT = 20;
export const FEEDBACK_LIST_MAX = 50;
export const FEEDBACK_ADMIN_SCAN_MAX = 200;
export const SUPPORT_SUBMIT_COOLDOWN_MS = 15_000;
export const SUPPORT_DEDUP_MS = 30_000;
export const SUPPORT_MAX_PER_WINDOW = 8;
export const SUPPORT_WINDOW_MS = 10 * 60 * 1000;

const CONTEXT_ID_RE = /^[a-zA-Z0-9._-]{8,80}$/;
const SIGNED_URL_HINT = /X-Goog-Signature|GoogleAccessId|X-Amz-Signature|https?:\/\//i;
const TOKENISH = /Bearer\s+|authorization|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./i;

let feedbackScreenshotTestHooks: { failMetadata?: boolean; failStorage?: boolean } | null = null;

export function setFeedbackScreenshotTestHooks(hooks: { failMetadata?: boolean; failStorage?: boolean } | null): void {
  feedbackScreenshotTestHooks = hooks;
}

export function validateFeedbackScreenshot(dataUrl?: string): string | undefined {
  if (!dataUrl) return undefined;
  if (SIGNED_URL_HINT.test(dataUrl) && !dataUrl.startsWith('data:image/')) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshots nur als Bild-Data-URL, keine Download-URLs');
  }
  if (dataUrl.length > MAX_FEEDBACK_SCREENSHOT_CHARS) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot ist zu groß');
  }
  parseAndValidateFeedbackScreenshot(dataUrl);
  return dataUrl;
}

function feedbackHasScreenshot(row: TesterFeedback): boolean {
  return Boolean(row.screenshotStoragePath || row.screenshotDataUrl);
}

function asPlainText(value: string, max: number): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function requirePlainText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') {
    throw new ServiceError(400, 'VALIDATION_ERROR', `${field} erforderlich`);
  }
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < min) {
    throw new ServiceError(400, 'VALIDATION_ERROR', `${field} darf nicht leer sein`);
  }
  if (text.length > max) {
    throw new ServiceError(400, 'VALIDATION_ERROR', `${field} ist zu lang`);
  }
  return text;
}

function optionalContextId(value: unknown, field: string): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new ServiceError(400, 'VALIDATION_ERROR', `${field} ungültig`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!CONTEXT_ID_RE.test(trimmed)) {
    throw new ServiceError(400, 'VALIDATION_ERROR', `${field} ungültig`);
  }
  return trimmed;
}

function resolveType(input: unknown, category: FeedbackCategory): FeedbackType {
  if (input == null || input === '') {
    if (category === 'bug') return 'bug';
    if (category === 'suggestion') return 'feature_request';
    return 'feedback';
  }
  if (typeof input !== 'string' || !FEEDBACK_TYPES.includes(input as FeedbackType)) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Ungültiger Support-Typ');
  }
  return input as FeedbackType;
}

function resolveCategory(input: unknown): FeedbackCategory {
  if (input == null || input === '') return 'other';
  if (typeof input !== 'string' || !FEEDBACK_CATEGORIES.includes(input as FeedbackCategory)) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Ungültige Kategorie');
  }
  return input as FeedbackCategory;
}

function resolveRequestId(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'requestId ungültig');
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!isSafeClientRequestId(trimmed)) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'requestId ungültig');
  }
  return trimmed;
}

export function toSafeFeedback(row: TesterFeedback): SafeFeedback {
  const { screenshotDataUrl: _shot, screenshotStoragePath: _path, ...rest } = row;
  return {
    ...rest,
    hasScreenshot: feedbackHasScreenshot(row),
  };
}

export function parseFeedbackListParams(query: { limit?: unknown; offset?: unknown }): {
  limit: number;
  offset: number;
} {
  const limitRaw = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : Number(query.limit);
  const offsetRaw = typeof query.offset === 'string' ? Number.parseInt(query.offset, 10) : Number(query.offset);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(FEEDBACK_LIST_MAX, Math.max(1, Math.floor(limitRaw)))
    : FEEDBACK_LIST_DEFAULT;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
  return { limit, offset };
}

async function assertContextOwnership(
  userId: string,
  refs: { projectId?: string; jobId?: string; fileId?: string }
): Promise<void> {
  if (refs.projectId) {
    const project = await getProject(refs.projectId, userId);
    if (!project) {
      throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    }
  }
  if (refs.jobId) {
    const job = await getJob(refs.jobId);
    if (!job || job.userId !== userId) {
      throw new ServiceError(404, 'NOT_FOUND', 'Job nicht gefunden');
    }
  }
  if (refs.fileId) {
    const file = await getUserFile(refs.fileId, userId);
    if (!file) {
      throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
    }
  }
}

function normalizeRow(raw: Record<string, unknown>): TesterFeedback {
  const category = FEEDBACK_CATEGORIES.includes(raw.category as FeedbackCategory)
    ? (raw.category as FeedbackCategory)
    : 'other';
  const type = FEEDBACK_TYPES.includes(raw.type as FeedbackType)
    ? (raw.type as FeedbackType)
    : resolveType(undefined, category);
  const message = String(raw.message ?? '');
  const subject =
    typeof raw.subject === 'string' && raw.subject.trim()
      ? String(raw.subject)
      : message.slice(0, FEEDBACK_SUBJECT_MAX);
  return {
    id: String(raw.id),
    userId: String(raw.userId),
    type,
    module: String(raw.module ?? '/support'),
    route: raw.route ? String(raw.route) : undefined,
    category,
    status: FEEDBACK_STATUSES.includes(raw.status as FeedbackStatus)
      ? (raw.status as FeedbackStatus)
      : 'new',
    subject,
    message,
    projectId: raw.projectId ? String(raw.projectId) : undefined,
    jobId: raw.jobId ? String(raw.jobId) : undefined,
    fileId: raw.fileId ? String(raw.fileId) : undefined,
    requestId: raw.requestId ? String(raw.requestId) : undefined,
    idempotencyKey: raw.idempotencyKey ? String(raw.idempotencyKey) : undefined,
    screenshotDataUrl: undefined,
    screenshotStoragePath: typeof raw.screenshotStoragePath === 'string' ? raw.screenshotStoragePath : undefined,
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? ''),
  };
}

export async function submitFeedback(
  userId: string,
  input: {
    module?: string;
    message: string;
    category?: string;
    type?: string;
    subject?: string;
    route?: string;
    projectId?: string;
    jobId?: string;
    fileId?: string;
    requestId?: string;
    idempotencyKey?: string;
    screenshotDataUrl?: string;
    status?: string;
    downloadUrl?: string;
    token?: string;
    authorization?: string;
  }
): Promise<TesterFeedback> {
  return withDevLock(`support:${userId}`, async () => {
    const category = resolveCategory(input.category);
    const type = resolveType(input.type, category);
    const message = requirePlainText(input.message, 'Nachricht', FEEDBACK_MESSAGE_MIN, FEEDBACK_MESSAGE_MAX);
    const subject = input.subject
      ? requirePlainText(input.subject, 'Betreff', 1, FEEDBACK_SUBJECT_MAX)
      : message.slice(0, FEEDBACK_SUBJECT_MAX);
    const module = asPlainText(String(input.module || input.route || '/support'), 80) || '/support';
    const route = input.route ? asPlainText(String(input.route), 200) : module;
    const projectId = optionalContextId(input.projectId, 'projectId');
    const jobId = optionalContextId(input.jobId, 'jobId');
    const fileId = optionalContextId(input.fileId, 'fileId');
    const requestId = resolveRequestId(input.requestId);
    const idempotencyKey = input.idempotencyKey
      ? asPlainText(String(input.idempotencyKey), 80) || undefined
      : undefined;

    if (TOKENISH.test(message) || TOKENISH.test(subject)) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Bitte keine Tokens oder Zugangsdaten in Support-Texten senden');
    }

    await assertContextOwnership(userId, { projectId, jobId, fileId });

    const ownRaw = await dsListWhere(COLLECTION, { userId });
    const own = ownRaw.map((row) => normalizeRow(row));
    const nowMs = Date.now();

    if (idempotencyKey) {
      const replay = own.find((row) => row.idempotencyKey === idempotencyKey);
      if (replay) return replay;
    }

    const duplicate = own.find(
      (row) =>
        row.subject === subject &&
        row.message === message &&
        row.type === type &&
        nowMs - Date.parse(row.createdAt) < SUPPORT_DEDUP_MS
    );
    if (duplicate) return duplicate;

    const cooldownMs = process.env.NODE_TEST === '1' ? 0 : SUPPORT_SUBMIT_COOLDOWN_MS;
    const windowed = own.filter((row) => nowMs - Date.parse(row.createdAt) < SUPPORT_WINDOW_MS);
    if (windowed.length >= SUPPORT_MAX_PER_WINDOW) {
      throw new ServiceError(429, 'RATE_LIMIT', 'Zu viele Support-Anfragen. Bitte später erneut versuchen.');
    }
    if (own[0] && cooldownMs > 0 && nowMs - Date.parse(own[0].createdAt) < cooldownMs) {
      throw new ServiceError(429, 'RATE_LIMIT', 'Bitte kurz warten, bevor du eine weitere Anfrage sendest.');
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    firestoreDocId(id);
    let screenshotStoragePath: string | undefined;
    if (input.screenshotDataUrl) {
      validateFeedbackScreenshot(input.screenshotDataUrl);
      const parsed = parseAndValidateFeedbackScreenshot(input.screenshotDataUrl);
      const ext = parsed.mimeType === 'image/jpeg' ? 'jpg' : parsed.mimeType === 'image/webp' ? 'webp' : 'png';
      const fileName = `${randomUUID()}.${ext}`;
      screenshotStoragePath = `users/${userId}/feedback/${id}/${fileName}`;
      if (feedbackScreenshotTestHooks?.failStorage) {
        throw new ServiceError(503, 'STORAGE_ERROR', 'Der Screenshot konnte nicht gespeichert werden');
      }
      try {
        await uploadAssetFromBuffer(userId, parsed.buffer, {
          folder: `feedback/${id}`,
          fileName,
          contentType: parsed.mimeType,
          extension: ext,
        });
      } catch (err) {
        if (isOwnedStoragePath(userId, screenshotStoragePath)) {
          await deleteOwnedStorageObject(userId, screenshotStoragePath).catch(() => undefined);
        }
        throw err instanceof ServiceError
          ? err
          : new ServiceError(503, 'STORAGE_ERROR', 'Der Screenshot konnte nicht gespeichert werden');
      }
    }

    const row: TesterFeedback = {
      id,
      userId,
      type,
      module,
      route,
      category,
      status: 'new',
      subject,
      message,
      ...(projectId ? { projectId } : {}),
      ...(jobId ? { jobId } : {}),
      ...(fileId ? { fileId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(screenshotStoragePath ? { screenshotStoragePath } : {}),
      createdAt: now,
      updatedAt: now,
    };
    try {
      if (feedbackScreenshotTestHooks?.failMetadata) {
        throw new ServiceError(503, 'STORAGE_ERROR', 'Die Anfrage konnte nicht gespeichert werden');
      }
      await dsSet(COLLECTION, firestoreDocId(row.id), row as unknown as Record<string, unknown>);
    } catch (err) {
      if (screenshotStoragePath && isOwnedStoragePath(userId, screenshotStoragePath)) {
        await deleteOwnedStorageObject(userId, screenshotStoragePath).catch(() => undefined);
      }
      throw err;
    }
    return row;
  });
}

export async function listFeedback(): Promise<TesterFeedback[]> {
  const rows = await dsList(COLLECTION, { orderBy: 'createdAt', order: 'desc', limit: 100 });
  return rows.map((row) => normalizeRow(row));
}

export async function listOwnFeedback(
  userId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ items: SafeFeedback[]; total: number; limit: number; offset: number; hasMore: boolean }> {
  const limit = Math.min(FEEDBACK_LIST_MAX, Math.max(1, opts?.limit ?? FEEDBACK_LIST_DEFAULT));
  const offset = Math.max(0, opts?.offset ?? 0);
  const rows = (await dsListWhere(COLLECTION, { userId })).map((row) => normalizeRow(row));
  const slice = rows.slice(offset, offset + limit);
  return {
    items: slice.map(toSafeFeedback),
    total: rows.length,
    limit,
    offset,
    hasMore: offset + slice.length < rows.length,
  };
}

export async function listFeedbackPage(opts?: {
  status?: string;
  type?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: SafeFeedback[]; total: number; limit: number; offset: number; hasMore: boolean }> {
  const limit = Math.min(FEEDBACK_LIST_MAX, Math.max(1, opts?.limit ?? FEEDBACK_LIST_DEFAULT));
  const offset = Math.max(0, opts?.offset ?? 0);
  const scanned = await dsList(COLLECTION, {
    orderBy: 'createdAt',
    order: 'desc',
    limit: FEEDBACK_ADMIN_SCAN_MAX,
  });
  let rows = scanned.map((row) => normalizeRow(row));
  if (opts?.status) {
    if (!FEEDBACK_STATUSES.includes(opts.status as FeedbackStatus)) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Ungültiger Status');
    }
    rows = rows.filter((row) => row.status === opts.status);
  }
  if (opts?.type) {
    if (!FEEDBACK_TYPES.includes(opts.type as FeedbackType)) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Ungültiger Support-Typ');
    }
    rows = rows.filter((row) => row.type === opts.type);
  }
  if (opts?.category) {
    if (!FEEDBACK_CATEGORIES.includes(opts.category as FeedbackCategory)) {
      throw new ServiceError(400, 'VALIDATION_ERROR', 'Ungültige Kategorie');
    }
    rows = rows.filter((row) => row.category === opts.category);
  }
  const slice = rows.slice(offset, offset + limit);
  return {
    items: slice.map(toSafeFeedback),
    total: rows.length,
    limit,
    offset,
    hasMore: offset + slice.length < rows.length,
  };
}

export async function getFeedbackById(id: string): Promise<TesterFeedback | null> {
  const row = await dsGet(COLLECTION, firestoreDocId(id));
  return row ? normalizeRow(row) : null;
}

export function assertFeedbackReadable(row: TesterFeedback, requesterId: string, isAdmin: boolean): void {
  if (isAdmin) return;
  if (row.userId !== requesterId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Feedback nicht gefunden');
  }
}

export async function issueFeedbackScreenshotUrl(
  feedbackId: string,
  requesterId: string,
  isAdmin: boolean,
  sign?: (path: string, ttlMs?: number) => Promise<string>
): Promise<{ downloadUrl: string; expiresAt: string; expiresInMs: number }> {
  const row = await getFeedbackById(feedbackId);
  if (!row) {
    throw new ServiceError(404, 'NOT_FOUND', 'Feedback nicht gefunden');
  }
  assertFeedbackReadable(row, requesterId, isAdmin);
  const path = row.screenshotStoragePath;
  if (!path || !isOwnedStoragePath(row.userId, path)) {
    throw new ServiceError(404, 'NOT_FOUND', 'Anhang nicht gefunden');
  }
  const url = await signOwnedStoragePath(row.userId, path, sign);
  return {
    downloadUrl: url,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString(),
    expiresInMs: SIGNED_URL_TTL_MS,
  };
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<TesterFeedback> {
  const row = await getFeedbackById(id);
  if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Feedback nicht gefunden');
  if (!FEEDBACK_STATUSES.includes(status)) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Ungültiger Status');
  }
  const next: TesterFeedback = { ...row, status, updatedAt: new Date().toISOString() };
  await dsSet(COLLECTION, id, next as unknown as Record<string, unknown>);
  return next;
}

export async function listFeedbackForUserExport(userId: string): Promise<SafeFeedback[]> {
  const rows = (await dsListWhere(COLLECTION, { userId })).map((row) => normalizeRow(row));
  return rows.map(toSafeFeedback);
}

export async function redactFeedbackForAccountDelete(userId: string): Promise<void> {
  const rows = await dsListWhere(COLLECTION, { userId });
  const now = new Date().toISOString();
  for (const raw of rows) {
    if (!raw.id) continue;
    const row = normalizeRow(raw);
    const path = row.screenshotStoragePath;
    if (path && isOwnedStoragePath(userId, path)) {
      await deleteOwnedStorageObject(userId, path).catch(() => undefined);
    }
    await dsSet(COLLECTION, firestoreDocId(row.id), {
      ...row,
      subject: '[redacted]',
      message: '[redacted]',
      screenshotDataUrl: undefined,
      screenshotStoragePath: undefined,
      updatedAt: now,
    } as unknown as Record<string, unknown>);
  }
}
