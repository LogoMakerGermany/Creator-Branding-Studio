import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function validatePasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`);
  }
}

/** Demo-Passwort für lokale Entwicklung (admin@cbs.local etc.) */
export const DEMO_PASSWORD = 'Demo2024!';
