import type { DatabaseAdapter } from '@cbs/shared';

/** Firestore adapter stub – aktivieren via DB_PROVIDER=firestore */
export class FirestoreDb implements DatabaseAdapter {
  async init(): Promise<void> {
    throw new Error('Firestore ist noch nicht aktiviert. Setze DB_PROVIDER=local für lokale Entwicklung.');
  }
  async close(): Promise<void> {}

  private notReady(): never {
    throw new Error('FirestoreDb: Implementierung für Produktion vorbereitet, noch nicht aktiv.');
  }

  async getUserById(_id: string) { return this.notReady(); }
  async getUserByEmail(_email: string) { return this.notReady(); }
  async listUsers() { return this.notReady(); }
  async createUser(_user: unknown) { return this.notReady(); }
  async updateUser(_id: string, _data: unknown) { return this.notReady(); }
  async getProject(_id: string) { return this.notReady(); }
  async listProjects(_userId?: string) { return this.notReady(); }
  async createProject(_project: unknown) { return this.notReady(); }
  async updateProject(_id: string, _data: unknown) { return this.notReady(); }
  async deleteProject(_id: string) { return this.notReady(); }
  async getDNA(_projectId: string) { return this.notReady(); }
  async saveDNA(_dna: unknown) { return this.notReady(); }
  async createJob(_job: unknown) { return this.notReady(); }
  async updateJob(_id: string, _data: unknown) { return this.notReady(); }
  async getJob(_id: string) { return this.notReady(); }
  async listJobs(_projectId: string) { return this.notReady(); }
  async listFailedJobs(_limit?: number) { return this.notReady(); }
  async countJobsByProvider(_since: string) { return this.notReady(); }
  async createAuditLog(_log: unknown) { return this.notReady(); }
  async listAuditLogs(_limit?: number) { return this.notReady(); }
  async createCopyrightLog(_log: unknown) { return this.notReady(); }
  async listCopyrightLogs(_limit?: number) { return this.notReady(); }
  async createSecurityEvent(_event: unknown) { return this.notReady(); }
  async listSecurityEvents(_limit?: number) { return this.notReady(); }
  async applyCoinTransaction(_tx: unknown) { return this.notReady(); }
  async finalizePayment(_paymentId: string, _status: unknown, _tx: unknown) { return this.notReady(); }
  async addCoinTransaction(_tx: unknown) { return this.notReady(); }
  async listCoinTransactions(_userId?: string, _limit?: number) { return this.notReady(); }
  async createPayment(_payment: unknown) { return this.notReady(); }
  async getPayment(_id: string) { return this.notReady(); }
  async updatePayment(_id: string, _data: unknown) { return this.notReady(); }
  async listPayments(_limit?: number) { return this.notReady(); }
}
