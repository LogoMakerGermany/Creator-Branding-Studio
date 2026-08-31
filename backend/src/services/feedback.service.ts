import { randomUUID } from 'node:crypto';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';

export const FEEDBACK_CATEGORIES = [
  'bug',
  'usability',
  'generation',
  'payment',
  'suggestion',
  'other',
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ['new', 'reviewing', 'resolved', 'closed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface TesterFeedback {
  id: string;
  userId: string;
  module: string;
  route?: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  message: string;
  screenshotDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'testerFeedback';
const MAX_SCREENSHOT_CHARS = 2_000_000;

export function validateFeedbackScreenshot(dataUrl?: string): string | undefined {
  if (!dataUrl) return undefined;
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(dataUrl)) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot muss ein Bild (PNG/JPEG/WebP) als Data-URL sein');
  }
  if (dataUrl.length > MAX_SCREENSHOT_CHARS) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot ist zu groß');
  }
  return dataUrl;
}

export async function submitFeedback(
  userId: string,
  input: {
    module: string;
    message: string;
    category?: string;
    route?: string;
    screenshotDataUrl?: string;
  }
): Promise<TesterFeedback> {
  const category = FEEDBACK_CATEGORIES.includes(input.category as FeedbackCategory)
    ? (input.category as FeedbackCategory)
    : 'other';
  const now = new Date().toISOString();
  const row: TesterFeedback = {
    id: randomUUID(),
    userId,
    module: input.module,
    route: input.route || input.module,
    category,
    status: 'new',
    message: input.message,
    screenshotDataUrl: validateFeedbackScreenshot(input.screenshotDataUrl),
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(COLLECTION, row.id, row as unknown as Record<string, unknown>);
  return row;
}

export async function listFeedback(): Promise<TesterFeedback[]> {
  const rows = await dsList(COLLECTION, { orderBy: 'createdAt', order: 'desc', limit: 100 });
  return rows as unknown as TesterFeedback[];
}

export async function getFeedbackById(id: string): Promise<TesterFeedback | null> {
  const row = await dsGet(COLLECTION, id);
  return row ? (row as unknown as TesterFeedback) : null;
}

export function assertFeedbackReadable(row: TesterFeedback, requesterId: string, isAdmin: boolean): void {
  if (isAdmin) return;
  if (row.userId !== requesterId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Feedback nicht gefunden');
  }
}

export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus
): Promise<TesterFeedback> {
  const row = await getFeedbackById(id);
  if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Feedback nicht gefunden');
  const next: TesterFeedback = { ...row, status, updatedAt: new Date().toISOString() };
  await dsSet(COLLECTION, id, next as unknown as Record<string, unknown>);
  return next;
}
