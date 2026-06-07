import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  AuditLog,
  BrandDNA,
  CoinTransaction,
  CopyrightLog,
  DatabaseAdapter,
  GenerationJob,
  PaymentRecord,
  Project,
  SecurityEvent,
  User,
} from '@cbs/shared';
import { ADMIN_COINS, DEFAULT_USER_COINS, TESTER_COINS } from '@cbs/shared';
import { env } from '../config.js';

interface DbData {
  users: User[];
  projects: Project[];
  dna: Record<string, BrandDNA>;
  jobs: GenerationJob[];
  auditLogs: AuditLog[];
  copyrightLogs: CopyrightLog[];
  securityEvents: SecurityEvent[];
  coinTransactions: CoinTransaction[];
  payments: PaymentRecord[];
}

const defaultData = (): DbData => ({
  users: [
    { id: 'admin-1', email: 'admin@cbs.local', name: 'Admin', role: 'admin', banned: false, coins: ADMIN_COINS, createdAt: new Date().toISOString() },
    { id: 'mod-1', email: 'mod@cbs.local', name: 'Moderator', role: 'moderator', banned: false, coins: 500, createdAt: new Date().toISOString() },
    { id: 'user-1', email: 'user@cbs.local', name: 'Benutzer', role: 'user', banned: false, coins: DEFAULT_USER_COINS, createdAt: new Date().toISOString() },
    { id: 'tester-1', email: 'tester@cbs.local', name: 'Plattform-Tester', role: 'tester', banned: false, coins: TESTER_COINS, isTester: true, createdAt: new Date().toISOString() },
  ],
  projects: [],
  dna: {},
  jobs: [],
  auditLogs: [],
  copyrightLogs: [],
  securityEvents: [],
  coinTransactions: [],
  payments: [],
});

export class LocalDb implements DatabaseAdapter {
  private data!: DbData;
  private filePath: string;

  constructor() {
    this.filePath = join(env.dataDir, 'cbs.json');
  }

  async init(): Promise<void> {
    mkdirSync(env.dataDir, { recursive: true });
    mkdirSync(env.assetsDir, { recursive: true });
    mkdirSync(env.uploadsDir, { recursive: true });
    if (existsSync(this.filePath)) {
      this.data = JSON.parse(readFileSync(this.filePath, 'utf8')) as DbData;
      this.migrate();
    } else {
      this.data = defaultData();
      this.persist();
    }
  }

  async close(): Promise<void> {
    this.persist();
  }

  private migrate(): void {
    if (!this.data.coinTransactions) this.data.coinTransactions = [];
    if (!this.data.payments) this.data.payments = [];
    for (const u of this.data.users) {
      if (typeof u.coins !== 'number') {
        u.coins = u.role === 'admin' ? ADMIN_COINS : u.role === 'tester' ? TESTER_COINS : DEFAULT_USER_COINS;
      }
    }
    if (!this.data.users.find(u => u.role === 'tester')) {
      this.data.users.push({
        id: 'tester-1', email: 'tester@cbs.local', name: 'Plattform-Tester',
        role: 'tester', banned: false, coins: TESTER_COINS, isTester: true, createdAt: new Date().toISOString(),
      });
    }
    this.persist();
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async getUserById(id: string): Promise<User | null> {
    return this.data.users.find(u => u.id === id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.data.users.find(u => u.email === email) || null;
  }

  async listUsers(): Promise<User[]> {
    return [...this.data.users];
  }

  async createUser(user: User): Promise<User> {
    this.data.users.push(user);
    this.persist();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx < 0) return null;
    this.data.users[idx] = { ...this.data.users[idx], ...data };
    this.persist();
    return this.data.users[idx];
  }

  async getProject(id: string): Promise<Project | null> {
    return this.data.projects.find(p => p.id === id) || null;
  }

  async listProjects(userId?: string): Promise<Project[]> {
    const list = userId ? this.data.projects.filter(p => p.userId === userId) : this.data.projects;
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createProject(project: Project): Promise<Project> {
    this.data.projects.push(project);
    this.persist();
    return project;
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
    const idx = this.data.projects.findIndex(p => p.id === id);
    if (idx < 0) return null;
    this.data.projects[idx] = { ...this.data.projects[idx], ...data, updatedAt: new Date().toISOString() };
    this.persist();
    return this.data.projects[idx];
  }

  async deleteProject(id: string): Promise<boolean> {
    const before = this.data.projects.length;
    this.data.projects = this.data.projects.filter(p => p.id !== id);
    delete this.data.dna[id];
    this.persist();
    return this.data.projects.length < before;
  }

  async getDNA(projectId: string): Promise<BrandDNA | null> {
    return this.data.dna[projectId] || null;
  }

  async saveDNA(dna: BrandDNA): Promise<BrandDNA> {
    this.data.dna[dna.projectId] = dna;
    this.persist();
    return dna;
  }

  async createJob(job: GenerationJob): Promise<GenerationJob> {
    this.data.jobs.push(job);
    this.persist();
    return job;
  }

  async updateJob(id: string, data: Partial<GenerationJob>): Promise<GenerationJob | null> {
    const idx = this.data.jobs.findIndex(j => j.id === id);
    if (idx < 0) return null;
    this.data.jobs[idx] = { ...this.data.jobs[idx], ...data, updatedAt: new Date().toISOString() };
    this.persist();
    return this.data.jobs[idx];
  }

  async getJob(id: string): Promise<GenerationJob | null> {
    return this.data.jobs.find(j => j.id === id) || null;
  }

  async listJobs(projectId: string): Promise<GenerationJob[]> {
    return this.data.jobs.filter(j => j.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listFailedJobs(limit = 50): Promise<GenerationJob[]> {
    return this.data.jobs.filter(j => j.status === 'failed').slice(0, limit);
  }

  async countJobsByProvider(since: string): Promise<{ provider: string; count: number }[]> {
    const counts = new Map<string, number>();
    for (const j of this.data.jobs) {
      if (j.createdAt >= since && j.provider) {
        counts.set(j.provider, (counts.get(j.provider) || 0) + 1);
      }
    }
    return [...counts.entries()].map(([provider, count]) => ({ provider, count }));
  }

  async createAuditLog(log: AuditLog): Promise<AuditLog> {
    this.data.auditLogs.unshift(log);
    if (this.data.auditLogs.length > 500) this.data.auditLogs.length = 500;
    this.persist();
    return log;
  }

  async listAuditLogs(limit = 100): Promise<AuditLog[]> {
    return this.data.auditLogs.slice(0, limit);
  }

  async createCopyrightLog(log: CopyrightLog): Promise<CopyrightLog> {
    this.data.copyrightLogs.unshift(log);
    this.persist();
    return log;
  }

  async listCopyrightLogs(limit = 100): Promise<CopyrightLog[]> {
    return this.data.copyrightLogs.slice(0, limit);
  }

  async createSecurityEvent(event: SecurityEvent): Promise<SecurityEvent> {
    this.data.securityEvents.unshift(event);
    this.persist();
    return event;
  }

  async listSecurityEvents(limit = 100): Promise<SecurityEvent[]> {
    return this.data.securityEvents.slice(0, limit);
  }

  async applyCoinTransaction(tx: CoinTransaction): Promise<CoinTransaction> {
    const userIdx = this.data.users.findIndex(u => u.id === tx.userId);
    if (userIdx < 0) throw new Error('Benutzer nicht gefunden');

    const user = this.data.users[userIdx];
    let balanceAfter: number;

    if (tx.type === 'debit') {
      if (user.coins < tx.amount) {
        throw new Error(`Nicht genug Coins (${user.coins}/${tx.amount}). Bitte im Shop aufladen.`);
      }
      balanceAfter = user.coins - tx.amount;
    } else {
      balanceAfter = user.coins + tx.amount;
    }

    const record: CoinTransaction = { ...tx, balanceAfter };
    this.data.users[userIdx] = { ...user, coins: balanceAfter };
    this.data.coinTransactions.unshift(record);
    if (this.data.coinTransactions.length > 1000) this.data.coinTransactions.length = 1000;
    this.persist();
    return record;
  }

  async finalizePayment(
    paymentId: string,
    status: PaymentRecord['status'],
    tx: CoinTransaction,
  ): Promise<boolean> {
    const paymentIdx = this.data.payments.findIndex(p => p.id === paymentId);
    if (paymentIdx < 0) return false;

    const payment = this.data.payments[paymentIdx];
    if (payment.status === 'completed' || payment.status === 'mock') return false;

    const userIdx = this.data.users.findIndex(u => u.id === payment.userId);
    if (userIdx < 0) throw new Error('Benutzer nicht gefunden');

    const user = this.data.users[userIdx];
    const balanceAfter = user.coins + payment.coins;
    const record: CoinTransaction = {
      ...tx,
      userId: payment.userId,
      amount: payment.coins,
      balanceAfter,
    };

    this.data.payments[paymentIdx] = { ...payment, status };
    this.data.users[userIdx] = { ...user, coins: balanceAfter };
    this.data.coinTransactions.unshift(record);
    if (this.data.coinTransactions.length > 1000) this.data.coinTransactions.length = 1000;
    this.persist();
    return true;
  }

  async addCoinTransaction(tx: CoinTransaction): Promise<CoinTransaction> {
    this.data.coinTransactions.unshift(tx);
    if (this.data.coinTransactions.length > 1000) this.data.coinTransactions.length = 1000;
    this.persist();
    return tx;
  }

  async listCoinTransactions(userId?: string, limit = 100): Promise<CoinTransaction[]> {
    const list = userId
      ? this.data.coinTransactions.filter(t => t.userId === userId)
      : this.data.coinTransactions;
    return list.slice(0, limit);
  }

  async createPayment(payment: PaymentRecord): Promise<PaymentRecord> {
    this.data.payments.unshift(payment);
    this.persist();
    return payment;
  }

  async getPayment(id: string): Promise<PaymentRecord | null> {
    return this.data.payments.find(p => p.id === id) || null;
  }

  async updatePayment(id: string, data: Partial<PaymentRecord>): Promise<PaymentRecord | null> {
    const idx = this.data.payments.findIndex(p => p.id === id);
    if (idx < 0) return null;
    this.data.payments[idx] = { ...this.data.payments[idx], ...data };
    this.persist();
    return this.data.payments[idx];
  }

  async listPayments(limit = 100): Promise<PaymentRecord[]> {
    return this.data.payments.slice(0, limit);
  }
}

let instance: LocalDb | null = null;

export async function getDb(): Promise<DatabaseAdapter> {
  if (!instance) {
    instance = new LocalDb();
    await instance.init();
  }
  return instance;
}
