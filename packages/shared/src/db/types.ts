import type { BrandDNA } from '../dna.js';
import type {
  AuditLog,
  CopyrightLog,
  Project,
  SecurityEvent,
  User,
} from '../roles.js';
import type { GenerationJob } from '../assets.js';
import type { CoinTransaction, PaymentRecord } from '../coins.js';

export interface DatabaseAdapter {
  init(): Promise<void>;
  close(): Promise<void>;

  // Users
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  createUser(user: User): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | null>;

  // Projects
  getProject(id: string): Promise<Project | null>;
  listProjects(userId?: string): Promise<Project[]>;
  createProject(project: Project): Promise<Project>;
  updateProject(id: string, data: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;

  // DNA
  getDNA(projectId: string): Promise<BrandDNA | null>;
  saveDNA(dna: BrandDNA): Promise<BrandDNA>;

  // Jobs
  createJob(job: GenerationJob): Promise<GenerationJob>;
  updateJob(id: string, data: Partial<GenerationJob>): Promise<GenerationJob | null>;
  getJob(id: string): Promise<GenerationJob | null>;
  listJobs(projectId: string): Promise<GenerationJob[]>;
  listFailedJobs(limit?: number): Promise<GenerationJob[]>;
  countJobsByProvider(since: string): Promise<{ provider: string; count: number }[]>;

  // Logs
  createAuditLog(log: AuditLog): Promise<AuditLog>;
  listAuditLogs(limit?: number): Promise<AuditLog[]>;
  createCopyrightLog(log: CopyrightLog): Promise<CopyrightLog>;
  listCopyrightLogs(limit?: number): Promise<CopyrightLog[]>;
  createSecurityEvent(event: SecurityEvent): Promise<SecurityEvent>;
  listSecurityEvents(limit?: number): Promise<SecurityEvent[]>;

  // Coins & Payments
  applyCoinTransaction(tx: CoinTransaction): Promise<CoinTransaction>;
  finalizePayment(paymentId: string, status: PaymentRecord['status'], tx: CoinTransaction): Promise<boolean>;
  addCoinTransaction(tx: CoinTransaction): Promise<CoinTransaction>;
  listCoinTransactions(userId?: string, limit?: number): Promise<CoinTransaction[]>;
  createPayment(payment: PaymentRecord): Promise<PaymentRecord>;
  getPayment(id: string): Promise<PaymentRecord | null>;
  updatePayment(id: string, data: Partial<PaymentRecord>): Promise<PaymentRecord | null>;
  listPayments(limit?: number): Promise<PaymentRecord[]>;
}
