import { devStore, isDevMode } from './dev-store.js';
import { getFirestore } from '../config/firebase.js';
import type { Query } from 'firebase-admin/firestore';

type ListOptions = {
  userId?: string;
  orderBy?: string;
  order?: 'asc' | 'desc';
  limit?: number;
};

export async function dsGet(
  collection: string,
  id: string
): Promise<Record<string, unknown> | null> {
  if (isDevMode()) {
    return devStore.getFromCollection(collection, id);
  }

  const db = getFirestore();
  const doc = await db.collection(collection).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function dsSet(
  collection: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  if (isDevMode()) {
    devStore.saveToCollection(collection, id, data);
    return;
  }

  const db = getFirestore();
  await db.collection(collection).doc(id).set({ ...data, id }, { merge: true });
}

export async function dsDelete(collection: string, id: string): Promise<void> {
  if (isDevMode()) {
    devStore.deleteFromCollection(collection, id);
    return;
  }

  const db = getFirestore();
  await db.collection(collection).doc(id).delete();
}

export async function dsList(
  collection: string,
  options: ListOptions = {}
): Promise<Record<string, unknown>[]> {
  const { userId, orderBy = 'createdAt', order = 'desc', limit } = options;

  if (isDevMode()) {
    let items = devStore.listCollection(
      collection,
      userId ? (item) => item.userId === userId : undefined
    );
    if (orderBy) {
      items = items.sort((a, b) => {
        const av = String(a[orderBy] ?? '');
        const bv = String(b[orderBy] ?? '');
        return order === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      });
    }
    return limit ? items.slice(0, limit) : items;
  }

  const db = getFirestore();
  let query: Query = db.collection(collection);

  if (userId) {
    query = query.where('userId', '==', userId);
  }

  if (orderBy) {
    query = query.orderBy(orderBy, order);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function dsListWhere(
  collection: string,
  filters: Record<string, unknown>,
  orderBy = 'createdAt',
  order: 'asc' | 'desc' = 'desc'
): Promise<Record<string, unknown>[]> {
  if (isDevMode()) {
    return devStore
      .listCollection(collection, (item) =>
        Object.entries(filters).every(([key, value]) => item[key] === value)
      )
      .sort((a, b) => {
        const av = String(a[orderBy] ?? '');
        const bv = String(b[orderBy] ?? '');
        return order === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      });
  }

  const db = getFirestore();
  const entries = Object.entries(filters);
  let query: Query = db.collection(collection);

  for (const [field, value] of entries.slice(0, 1)) {
    query = query.where(field, '==', value);
  }

  if (orderBy) {
    query = query.orderBy(orderBy, order);
  }

  const snap = await query.get();
  let results = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  if (entries.length > 1) {
    results = results.filter((item) =>
      entries.every(([key, value]) => (item as Record<string, unknown>)[key] === value)
    );
  }

  return results;
}
