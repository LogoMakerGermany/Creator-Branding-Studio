/** Firestore rejects `undefined` field values. JSON omits them; Admin SDK does not. */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Drops only `undefined`. Keeps `false`, `0`, `""`, and `null`. */
export function omitUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedFields(item)) as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      out[key] = omitUndefinedFields(nested);
    }
    return out as T;
  }
  return value;
}
