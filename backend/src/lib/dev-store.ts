import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../.data');

type StoreData = {
  users: Record<string, unknown>;
  dna: Record<string, unknown>;
  coinTransactions: unknown[];
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getStorePath(name: string): string {
  return path.join(DATA_DIR, `${name}.json`);
}

function readJson<T>(name: string, fallback: T): T {
  ensureDataDir();
  const filePath = getStorePath(name);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function writeJson<T>(name: string, data: T): void {
  ensureDataDir();
  fs.writeFileSync(getStorePath(name), JSON.stringify(data, null, 2));
}

export const devStore = {
  getUsers(): Record<string, Record<string, unknown>> {
    return readJson('users', {});
  },

  saveUser(id: string, user: Record<string, unknown>): void {
    const users = this.getUsers();
    users[id] = user;
    writeJson('users', users);
  },

  getUser(id: string): Record<string, unknown> | null {
    return this.getUsers()[id] ?? null;
  },

  getDnaList(): Record<string, Record<string, unknown>> {
    return readJson('dna', {});
  },

  saveDna(id: string, dna: Record<string, unknown>): void {
    const all = this.getDnaList();
    all[id] = dna;
    writeJson('dna', all);
  },

  getDna(id: string): Record<string, unknown> | null {
    return this.getDnaList()[id] ?? null;
  },

  getDnaByUser(userId: string): Record<string, unknown>[] {
    return Object.values(this.getDnaList()).filter((d) => d.userId === userId);
  },

  getTransactions(): unknown[] {
    return readJson('coinTransactions', []);
  },

  addTransaction(tx: Record<string, unknown>): void {
    const txs = this.getTransactions() as Record<string, unknown>[];
    txs.unshift(tx);
    writeJson('coinTransactions', txs);
  },

  getTransactionsByUser(userId: string): unknown[] {
    return (this.getTransactions() as Record<string, unknown>[]).filter(
      (t) => t.userId === userId
    );
  },

  getJobs(): Record<string, Record<string, unknown>> {
    return readJson('jobs', {});
  },

  saveJob(id: string, job: Record<string, unknown>): void {
    const all = this.getJobs();
    all[id] = job;
    writeJson('jobs', all);
  },

  getJob(id: string): Record<string, unknown> | null {
    return this.getJobs()[id] ?? null;
  },

  getJobsByUser(userId: string): Record<string, unknown>[] {
    return Object.values(this.getJobs())
      .filter((j) => j.userId === userId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  },

  getProcessedSessions(): Record<string, boolean> {
    return readJson('processedSessions', {});
  },

  markSessionProcessed(sessionId: string): void {
    const sessions = this.getProcessedSessions();
    sessions[sessionId] = true;
    writeJson('processedSessions', sessions);
  },

  isSessionProcessed(sessionId: string): boolean {
    return Boolean(this.getProcessedSessions()[sessionId]);
  },

  // Generic collection helpers
  getCollection(name: string): Record<string, Record<string, unknown>> {
    return readJson(name, {});
  },

  saveToCollection(name: string, id: string, item: Record<string, unknown>): void {
    const all = this.getCollection(name);
    all[id] = item;
    writeJson(name, all);
  },

  getFromCollection(name: string, id: string): Record<string, unknown> | null {
    return this.getCollection(name)[id] ?? null;
  },

  listCollection(name: string, filter?: (item: Record<string, unknown>) => boolean): Record<string, unknown>[] {
    const items = Object.values(this.getCollection(name));
    return filter ? items.filter(filter) : items;
  },

  deleteFromCollection(name: string, id: string): void {
    const all = this.getCollection(name);
    delete all[id];
    writeJson(name, all);
  },
};

import { isDevMode as checkDevMode } from '../config/env.js';

export function isDevMode(): boolean {
  return checkDevMode();
}
