/** Firestore rejects `undefined` field values. JSON omits them; Admin SDK does not. */
import { ServiceError } from './errors.js';

export const FIRESTORE_WRITE_USER_MESSAGE = 'Ein interner Fehler ist aufgetreten';

export class FirestoreWriteGuardError extends ServiceError {
  readonly technicalCode: string;

  constructor(technicalCode: string) {
    super(500, 'INTERNAL_ERROR', FIRESTORE_WRITE_USER_MESSAGE);
    this.name = 'FirestoreWriteGuardError';
    this.technicalCode = technicalCode;
  }
}

function failGuard(technicalCode: string): never {
  console.error('[firestore-write-guard]', technicalCode);
  throw new FirestoreWriteGuardError(technicalCode);
}

function isPreservedFirestoreValue(value: object): boolean {
  if (value instanceof Date) return true;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return true;
  if (ArrayBuffer.isView(value)) return true;
  const ctor = value.constructor?.name ?? '';
  return (
    ctor === 'Timestamp' ||
    ctor === 'GeoPoint' ||
    ctor === 'DocumentReference' ||
    ctor === 'FieldValue' ||
    ctor === 'VectorValue' ||
    ctor === 'FieldPath' ||
    ctor === 'Bytes' ||
    ctor.endsWith('Transform') ||
    ctor.includes('FieldValue')
  );
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  return !isPreservedFirestoreValue(value);
}

const FIRESTORE_ID_MAX_BYTES = 1500;

/**
 * Document IDs are not payload fields. Do not trim — that would mint a different identity.
 * Slash would split the Firestore path. Colons/dashes/underscores stay valid (welcome:, OAuth).
 */
export function assertValidFirestoreDocumentId(id: unknown): asserts id is string {
  if (typeof id !== 'string') failGuard('INVALID_DOCUMENT_ID');
  if (id.length === 0) failGuard('EMPTY_DOCUMENT_ID');
  if (/^[\s\u00a0]+$/.test(id)) failGuard('WHITESPACE_DOCUMENT_ID');
  if (id.includes('/')) failGuard('PATH_LIKE_DOCUMENT_ID');
  if (Buffer.byteLength(id, 'utf8') > FIRESTORE_ID_MAX_BYTES) failGuard('DOCUMENT_ID_TOO_LONG');
}

export function firestoreDocId(id: unknown): string {
  assertValidFirestoreDocumentId(id);
  return id;
}

export function assertFiniteNumber(value: unknown, technicalCode = 'NON_FINITE_NUMBER'): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) failGuard(technicalCode);
}

/** Drops only `undefined`. Keeps `false`, `0`, `""`, and `null`. Rejects non-finite numbers. Preserves Firestore natives. */
export function omitUndefinedFields<T>(value: T): T {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) failGuard('NON_FINITE_NUMBER');
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => omitUndefinedFields(item)) as T;
  }
  if (isRecordLike(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      out[key] = omitUndefinedFields(nested);
    }
    return out as T;
  }
  return value;
}

/** Payload sanitation for writes. Undefined optional fields omitted; non-finite numbers fail closed. */
export function sanitizeFirestorePayload<T>(value: T): T {
  return omitUndefinedFields(value);
}
