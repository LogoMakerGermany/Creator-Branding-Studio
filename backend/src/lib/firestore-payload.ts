/** Firestore rejects `undefined` field values. JSON omits them; Admin SDK does not. */

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

/** Drops only `undefined`. Keeps `false`, `0`, `""`, and `null`. Preserves Firestore natives. */
export function omitUndefinedFields<T>(value: T): T {
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
