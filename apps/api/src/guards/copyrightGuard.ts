import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/localDb.js';
import { classifyCopyright } from '../providers/openai.js';
import { env } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let blocklist: string[] = [];
try {
  blocklist = JSON.parse(readFileSync(resolve(__dirname, '../data/copyright-blocklist.json'), 'utf8')) as string[];
} catch {
  blocklist = [
    'disney', 'marvel', 'pokemon', 'nintendo', 'minecraft', 'fortnite',
    'coca-cola', 'nike', 'apple logo', 'mcdonalds', 'star wars',
    'harry potter', 'mickey mouse', 'super mario', 'zelda', 'batman',
  ];
}

export interface CopyrightResult {
  blocked: boolean;
  reason?: string;
  matchedTerm?: string;
}

export async function checkCopyright(
  text: string,
  userId?: string,
  projectId?: string,
): Promise<CopyrightResult> {
  const lower = text.toLowerCase();
  for (const term of blocklist) {
    if (lower.includes(term.toLowerCase())) {
      await logCopyright(userId, projectId, `Blockliste: ${term}`, term);
      return { blocked: true, reason: `Geschützte Marke/Franchise erkannt: ${term}`, matchedTerm: term };
    }
  }

  if (env.openaiApiKey && text.length > 3) {
    try {
      const result = await classifyCopyright(text);
      if (result.flagged) {
        await logCopyright(userId, projectId, result.reason || 'KI-Klassifikation', undefined);
        return { blocked: true, reason: result.reason || 'Geschützter Inhalt erkannt' };
      }
    } catch {
      // KI-Prüfung optional
    }
  }

  return { blocked: false };
}

async function logCopyright(userId?: string, projectId?: string, reason?: string, matchedTerm?: string): Promise<void> {
  const db = await getDb();
  await db.createCopyrightLog({
    id: crypto.randomUUID(),
    userId,
    projectId,
    reason: reason || 'Copyright-Verdacht',
    matchedTerm,
    createdAt: new Date().toISOString(),
  });
}
