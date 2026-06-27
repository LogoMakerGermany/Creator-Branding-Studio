import { randomUUID } from 'node:crypto';
import { dsSet, dsDelete, dsList } from '../lib/data-store.js';
import { getActiveDna } from './dna.service.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AssistantSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'assistantSessions';

export async function getOrCreateSession(userId: string): Promise<AssistantSession> {
  const sessions = await dsList(COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc', limit: 1 });
  const existing = sessions[0];

  if (existing) return existing as unknown as AssistantSession;

  const now = new Date().toISOString();
  const session: AssistantSession = {
    id: randomUUID(),
    userId,
    messages: [{
      id: randomUUID(),
      role: 'assistant',
      content: 'Hallo! Ich bin dein KI Creator Assistent. Frag mich zu Branding, Content-Strategie oder Design-Verbesserungen.',
      createdAt: now,
    }],
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

export async function chat(userId: string, message: string): Promise<AssistantSession> {
  const session = await getOrCreateSession(userId);
  const now = new Date().toISOString();

  session.messages.push({
    id: randomUUID(),
    role: 'user',
    content: message,
    createdAt: now,
  });

  const activeDna = await getActiveDna(userId);
  const reply = await generateAssistantReply(message, activeDna);

  session.messages.push({
    id: randomUUID(),
    role: 'assistant',
    content: reply,
    createdAt: new Date().toISOString(),
  });

  session.updatedAt = new Date().toISOString();
  await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

async function generateAssistantReply(
  message: string,
  dna: Awaited<ReturnType<typeof getActiveDna>>
): Promise<string> {
  const dnaContext = dna
    ? `Creator DNA: "${dna.name}", Stil: ${dna.styleDirection}, Farben: ${dna.primaryColors.join(', ')}`
    : 'Keine Creator DNA vorhanden.';

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Du bist der KI Creator Assistent von UCBS (Ultimate Creator Branding Studio). Hilf Creatorn bei Branding, Content-Strategie, Stream-Design und Social Media. Antworte auf Deutsch, präzise und actionable. ${dnaContext}`,
            },
            { role: 'user', content: message },
          ],
          max_tokens: 600,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { choices: { message: { content: string } }[] };
        return data.choices[0]?.message?.content || getFallbackReply(message, dna);
      }
    } catch {
      /* fallback below */
    }
  }

  return getFallbackReply(message, dna);
}

function getFallbackReply(message: string, dna: Awaited<ReturnType<typeof getActiveDna>>): string {
  const lower = message.toLowerCase();

  if (lower.includes('banner') || lower.includes('overlay')) {
    return `Für Banner und Overlays empfehle ich ein 1920x480 Format (Twitch) oder 2560x1440 (YouTube). ${dna ? `Nutze deine Primärfarbe ${dna.primaryColors[0]} als Akzent und halte Text in den Safe Zones.` : 'Erstelle zuerst eine Creator DNA für konsistente Farben.'}`;
  }

  if (lower.includes('logo')) {
    return `Ein starkes Creator-Logo sollte in 512x512 erkennbar sein und auch als Favicon funktionieren. ${dna ? `Dein ${dna.styleDirection}-Stil passt zu klaren Silhouetten und maximal 3 Farben.` : 'Definiere zuerst deine Creator DNA.'}`;
  }

  if (lower.includes('strateg') || lower.includes('content') || lower.includes('post')) {
    return 'Content-Strategie Tipp: 1) 3 Content-Säulen definieren (z.B. Gaming, Behind-the-Scenes, Tutorials), 2) 1 Hauptplattform + 2 Repurpose-Kanäle, 3) Wöchentlicher Rhythmus mit Batch-Produktion. Nutze den Content Kalender (Phase 4) wenn verfügbar.';
  }

  if (lower.includes('twitch') || lower.includes('stream')) {
    return `Stream-Branding Checkliste: Facecam-Rahmen, Stream-Panels, Offline-Banner, Alerts und Starting-Soon Screen. ${dna ? `Deine DNA "${dna.name}" liefert die Farbgrundlage für alle Elemente.` : 'Starte mit der Creator DNA Engine.'}`;
  }

  return `Danke für deine Frage! ${dna ? `Basierend auf deiner DNA "${dna.name}" (${dna.styleDirection}): ` : ''}Ich empfehle, dein Branding über alle Plattformen konsistent zu halten. Nutze Logo Studio, Banner Studio und den Branding Generator für ein einheitliches Erscheinungsbild. Für detailliertere KI-Antworten setze OPENAI_API_KEY in der Backend-.env.`;
}

export async function clearSession(userId: string): Promise<void> {
  const sessions = await dsList(COLLECTION, { userId });
  for (const s of sessions) {
    await dsDelete(COLLECTION, s.id as string);
  }
}
