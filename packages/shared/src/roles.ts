export type UserRole = 'admin' | 'moderator' | 'user' | 'tester';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  banned: boolean;
  coins: number;
  isTester?: boolean;
  /** Nur serverseitig – nie an Clients senden */
  passwordHash?: string;
  firebaseUid?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource?: string;
  details?: string;
  ip?: string;
  createdAt: string;
}

export interface CopyrightLog {
  id: string;
  userId?: string;
  projectId?: string;
  reason: string;
  matchedTerm?: string;
  createdAt: string;
}

export interface SecurityEvent {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  userId?: string;
  ip?: string;
  createdAt: string;
}
