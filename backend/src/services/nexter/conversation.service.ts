import { randomUUID } from 'node:crypto';
import {
  parseMockupIntent,
  parseAnimationIntent,
  parseHighlightIndex,
  parseTextIntent,
  NEXTER_STUDIO_PATHS,
  type NexterChatMessage,
  type NexterQuoteKind,
  type NexterSession,
} from '@ucbs/shared';
import { isDevMode, isProduction, getOpenAiApiKey } from '../../config/env.js';
import { dsGet, dsSet, dsDelete, dsList } from '../../lib/data-store.js';
import { ServiceError } from '../../lib/errors.js';
import { buildNexterContext } from './context.service.js';
import { listMemory, memoryAsPrompt, storeMemory } from './memory.service.js';
import { createQuote } from './quotes.service.js';
import {
  buildActions,
  coinCostForKind,
  detectAnalyzeIntent,
  detectIncompletePrompt,
  detectOpenStudio,
  detectQuoteKind,
  detectChangeIntent,
  resolveChangeTarget,
  detectLockedTraitOverride,
  extractPreference,
  formatContextForPrompt,
  recommendFormat,
  recordOwnedByUser,
  warnBadSettings,
  detectFakeDetectionRequest,
  detectShowHighlights,
  detectMakeShort,
  detectAnalyzeVideo,
  detectExternalPublishIntent,
} from './tools.service.js';

const COLLECTION = 'nexterSessions';

function greeting(ctxLine: string): NexterChatMessage {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    role: 'assistant',
    content: `Hallo, ich bin Nexter — dein Creator-OS. ${ctxLine} Sag mir, womit du starten willst.`,
    createdAt: now,
    suggestions: ['Was weißt du über mein aktuelles Creator-Projekt?', 'Ich möchte daraus ein Logo machen.', 'Öffne das Logo Studio.'],
  };
}

export async function getNexterSessionForUser(sessionId: string, userId: string): Promise<NexterSession | null> {
  const row = await dsGet(COLLECTION, sessionId);
  return recordOwnedByUser(row as unknown as NexterSession | null, userId);
}

export async function getOrCreateNexterSession(userId: string): Promise<NexterSession> {
  const sessions = await dsList(COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc', limit: 1 });
  const existing = sessions[0];
  if (existing) return existing as unknown as NexterSession;

  const now = new Date().toISOString();
  const ctx = await buildNexterContext(userId).catch(() => null);
  const ctxLine = ctx?.hasDna
    ? `DNA „${ctx.dnaName}“ ist aktiv, ${ctx.coinBalance} Coins.`
    : `Du hast ${ctx?.coinBalance ?? 0} Coins. Eine Creator DNA fehlt noch.`;
  const session: NexterSession = {
    id: randomUUID(),
    userId,
    messages: [greeting(ctxLine)],
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

export async function createNexterSession(userId: string): Promise<NexterSession> {
  const now = new Date().toISOString();
  const ctx = await buildNexterContext(userId).catch(() => null);
  const ctxLine = ctx?.hasDna
    ? `DNA „${ctx.dnaName}“ ist aktiv.`
    : 'Lege eine Creator DNA an, dann bleiben alle Studios im gleichen Look.';
  const session: NexterSession = {
    id: randomUUID(),
    userId,
    messages: [greeting(ctxLine)],
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

export async function clearNexterSession(userId: string): Promise<void> {
  const sessions = await dsList(COLLECTION, { userId });
  for (const s of sessions) {
    await dsDelete(COLLECTION, s.id as string);
  }
}

export async function appendAssistantMessage(
  userId: string,
  content: string,
  extra?: Partial<NexterChatMessage>
): Promise<NexterSession> {
  const session = await getOrCreateNexterSession(userId);
  session.messages.push({
    id: randomUUID(),
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  });
  session.updatedAt = new Date().toISOString();
  await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

export async function nexterChat(
  userId: string,
  message: string,
  meta?: { path?: string; hint?: string; projectId?: string }
): Promise<NexterSession> {
  const session = await getOrCreateNexterSession(userId);
  const now = new Date().toISOString();

  session.messages.push({
    id: randomUUID(),
    role: 'user',
    content: message,
    createdAt: now,
  });

  const ctx = await buildNexterContext(userId, meta?.projectId);
  const pref = extractPreference(message);
  if (pref) {
    const skipColorPref = pref.key === 'preferredColor' && ctx.locks?.colors;
    const skipStylePref = pref.key === 'preferredStyle' && ctx.locks?.style;
    if (!skipColorPref && !skipStylePref) {
      await storeMemory(userId, pref.key, pref.value, 'preference').catch(() => undefined);
    }
  }

  const locked = detectLockedTraitOverride(message, ctx);
  if (locked) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: locked,
      createdAt: new Date().toISOString(),
      suggestions: ['Creator DNA öffnen', 'Sperre in der DNA ändern'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Creator DNA öffnen', path: '/creator-dna' }],
    });
    session.updatedAt = new Date().toISOString();
    await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
    return session;
  }

  const publishBlock = detectExternalPublishIntent(message);
  if (publishBlock) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: publishBlock,
      createdAt: new Date().toISOString(),
      suggestions: ['Öffne das Text Studio', 'Intern planen'],
      actions: [
        { id: randomUUID(), tool: 'open_studio', label: 'Text Studio öffnen', path: NEXTER_STUDIO_PATHS.text },
        { id: randomUUID(), tool: 'open_studio', label: 'Social Content Studio öffnen', path: NEXTER_STUDIO_PATHS.social },
      ],
    });
    session.updatedAt = new Date().toISOString();
    await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
    return session;
  }

  const fakeDetect = detectFakeDetectionRequest(message);
  if (fakeDetect) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: fakeDetect,
      createdAt: new Date().toISOString(),
      suggestions: ['Zeig mir die besten Stellen aus meinem Video', 'Öffne das Video Studio'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path: NEXTER_STUDIO_PATHS.video }],
    });
    session.updatedAt = new Date().toISOString();
    await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
    return session;
  }

  if (detectMakeShort(message)) {
    const idx = parseHighlightIndex(message);
    const highlight = idx != null ? ctx.videoHighlights?.[idx] : undefined;
    if (highlight && ctx.videoProjectId) {
      const path = `${NEXTER_STUDIO_PATHS.shorts}?projectId=${encodeURIComponent(ctx.videoProjectId)}&start=${highlight.start}&end=${highlight.end}`;
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: `Highlight ${idx! + 1}: ${highlight.start.toFixed(1)}s–${highlight.end.toFixed(1)}s (${highlight.reason || highlight.label}). Shorts Studio öffnet genau diesen Bereich — 9:16, kein erfundener Clip.`,
        createdAt: new Date().toISOString(),
        suggestions: ['Shorts Studio öffnen', 'Zeig mir die Highlights'],
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Als Short öffnen', path }],
      });
    } else {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content:
          'Dafür brauche ich eine gespeicherte Video-Analyse mit Highlights. Öffne das Video Studio und starte „Lokal analysieren“ — ich erfinde keine Clips.',
        createdAt: new Date().toISOString(),
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path: NEXTER_STUDIO_PATHS.video }],
      });
    }
    session.updatedAt = new Date().toISOString();
    await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
    return session;
  }

  if (detectShowHighlights(message)) {
    const list = ctx.videoHighlights ?? [];
    const content = list.length
      ? `Echte Highlight-Kandidaten aus der Analyse:\n${list
          .map(
            (h, i) =>
              `${i + 1}. ${h.start.toFixed(1)}s–${h.end.toFixed(1)}s · Score ${h.score} — ${h.reason || h.label}`
          )
          .join('\n')}`
      : 'Es liegt noch keine lokale Analyse vor. Öffne das Video Studio und starte „Lokal analysieren“. Ich erfinde keine Kill-Events.';
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      suggestions: list.length ? ['Mach Highlight 1 zu einem Short', 'Öffne das Video Studio'] : ['Öffne das Video Studio'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path: NEXTER_STUDIO_PATHS.video }],
    });
    session.updatedAt = new Date().toISOString();
    await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
    return session;
  }

  if (detectAnalyzeVideo(message)) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Ich öffne das Video Studio. Lokale Szenen/Pausen laufen ohne KI-Key. Whisper-Transkript ist kostenpflichtig bzw. braucht OPENAI_API_KEY — ich starte das nicht automatisch.',
      createdAt: new Date().toISOString(),
      suggestions: ['Lokal analysieren', 'Öffne das Video Studio'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path: NEXTER_STUDIO_PATHS.video }],
    });
    session.updatedAt = new Date().toISOString();
    await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
    return session;
  }

  const changeIntent = detectChangeIntent(message);
  const incomplete = detectIncompletePrompt(message, ctx);
  const wantsGenerate = Boolean(changeIntent || detectQuoteKind(message));
  const openPath = detectOpenStudio(message);

  if (incomplete && !openPath && !detectAnalyzeIntent(message) && !changeIntent) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: incomplete,
      createdAt: new Date().toISOString(),
      suggestions: ctx.hasDna
        ? ['Logo aus meiner DNA', 'Öffne das Logo Studio']
        : ['Creator DNA anlegen', 'Öffne das Logo Studio'],
      actions: ctx.hasDna
        ? undefined
        : [
            {
              id: randomUUID(),
              tool: 'open_studio',
              label: 'Creator DNA öffnen',
              path: '/creator-dna',
            },
          ],
    });
    session.updatedAt = new Date().toISOString();
    await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
    return session;
  }

  let quoteId: string | undefined;
  let quoteKind: NexterQuoteKind | undefined;
  let isChangeQuote = false;
  if (changeIntent && !openPath) {
    const resolved = resolveChangeTarget(ctx, changeIntent.kind, changeIntent.wantsLatest);
    if ('ask' in resolved) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: `${resolved.ask} Ich rate nicht und starte keinen Job.`,
        createdAt: new Date().toISOString(),
      });
      session.updatedAt = new Date().toISOString();
      await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
      return session;
    }
    if ('none' in resolved) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: resolved.none,
        createdAt: new Date().toISOString(),
      });
      session.updatedAt = new Date().toISOString();
      await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
      return session;
    }
    if (!ctx.hasDna) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: 'Dafür brauche ich zuerst deine Creator DNA. Kein Job wurde gestartet.',
        createdAt: new Date().toISOString(),
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Creator DNA öffnen', path: '/creator-dna' }],
      });
      session.updatedAt = new Date().toISOString();
      await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
      return session;
    }
    quoteKind = changeIntent.kind;
    isChangeQuote = true;
    const quote = await createQuote(userId, quoteKind, meta?.projectId || ctx.projectId, {
      changeRequest: true,
      jobId: resolved.jobId,
      request: changeIntent.request,
    });
    quoteId = quote.id;
  } else if (wantsGenerate && !openPath) {
    quoteKind = detectQuoteKind(message)!;
    if (quoteKind !== 'text' && !ctx.hasDna) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: 'Dafür brauche ich zuerst deine Creator DNA — sonst kann ich kein konsistentes Branding vorbereiten. Kein Job wurde gestartet.',
        createdAt: new Date().toISOString(),
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Creator DNA öffnen', path: '/creator-dna' }],
      });
      session.updatedAt = new Date().toISOString();
      await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
      return session;
    }
    if (quoteKind === 'text') {
      const intent = parseTextIntent(message);
      if (intent.wantLastShort && !ctx.lastShortId) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content:
            'Ich finde kein eigenes Short. Exportiere zuerst eines im Shorts Studio — fremde Assets nutze ich nicht. Kein Textjob wurde gestartet.',
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Shorts Studio öffnen', path: NEXTER_STUDIO_PATHS.shorts }],
        });
        session.updatedAt = new Date().toISOString();
        await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
        return session;
      }
      if ((intent.revisionField || intent.variantCount) && !ctx.contentPackageId && !intent.wantLastShort) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content:
            'Dafür brauche ich ein bestehendes Content-Paket. Erstelle zuerst Titel/Caption/Hashtags — ich starte keinen neuen Zufallstext. Kein Job, keine Coins.',
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Text Studio öffnen', path: NEXTER_STUDIO_PATHS.text }],
        });
        session.updatedAt = new Date().toISOString();
        await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
        return session;
      }
    }
    const quotePayload =
      quoteKind === 'mockup'
        ? { ...parseMockupIntent(message) }
        : quoteKind === 'animation'
          ? { ...parseAnimationIntent(message), message }
          : quoteKind === 'text'
            ? (() => {
                const intent = parseTextIntent(message);
                return {
                  kind: intent.kind,
                  topic: message,
                  projectId: meta?.projectId || ctx.projectId,
                  sourceType: intent.wantLastShort ? 'short' : ctx.contentPackageId && intent.revisionField ? undefined : 'topic',
                  sourceAssetId: intent.wantLastShort ? ctx.lastShortId : undefined,
                  videoProjectId: intent.wantLastShort ? ctx.lastShortVideoProjectId : undefined,
                  wantLastShort: intent.wantLastShort,
                  packageId: intent.revisionField || intent.variantCount ? ctx.contentPackageId : undefined,
                  revisionField: intent.revisionField,
                  revisionInstruction: intent.revisionInstruction || message,
                  variantCount: intent.variantCount,
                  platforms: intent.platform ? [intent.platform] : undefined,
                };
              })()
            : undefined;
    const quote = await createQuote(userId, quoteKind, meta?.projectId, quotePayload);
    quoteId = quote.id;
  }

  const memory = await listMemory(userId);
  const { suggestions, actions } = buildActions(message, ctx, quoteId, quoteKind, isChangeQuote);
  const warning = warnBadSettings(message);
  const format = recommendFormat(message);

  const reply = await generateNexterReply({
    messages: session.messages,
    ctx,
    memory: memoryAsPrompt(memory),
    path: meta?.path,
    hint: meta?.hint,
    warning,
    format,
    quoteKind,
    quotedCost: quoteId && quoteKind ? coinCostForKind(quoteKind) : null,
  });

  session.messages.push({
    id: randomUUID(),
    role: 'assistant',
    content: reply,
    createdAt: new Date().toISOString(),
    suggestions,
    actions,
  });
  session.updatedAt = new Date().toISOString();
  await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

async function generateNexterReply(input: {
  messages: NexterChatMessage[];
  ctx: Awaited<ReturnType<typeof buildNexterContext>>;
  memory: string;
  path?: string;
  hint?: string;
  warning: string | null;
  format: string | null;
  quoteKind?: NexterQuoteKind;
  quotedCost?: number | null;
}): Promise<string> {
  const contextBlock = formatContextForPrompt(input.ctx);
  const system = `Du bist NEXTER, das Gehirn von NEXTER Creator Studio.
Antworte auf Deutsch, knapp und actionable.
Du startest KEINE kostenpflichtigen Jobs. Du schlägst nur vor. Der Nutzer muss auf „Erstellen“ klicken.
Behaupte niemals, dass ein Beitrag auf TikTok, YouTube, Instagram, Twitch oder Discord veröffentlicht, hochgeladen oder verbunden wurde. Intern geplant ist nur eine interne Speicherung.
Wenn Infos fehlen und sie NICHT in der DNA stehen, frage nach.
Wenn DNA-Merkmale als LOCKED/gesperrt markiert sind, darfst du sie NICHT eigenmächtig ändern und NICHT still überschreiben. Erkläre die Sperre und frage, ob der Nutzer sie in der Creator DNA ändern will. Entsperre niemals automatisch.
${contextBlock}
Vorlieben: ${input.memory}.
Aktuelle Seite: ${input.path ?? 'unbekannt'} ${input.hint ? `(${input.hint})` : ''}.
${input.warning ? `WARNUNG: ${input.warning}` : ''}
${input.format ? `FORMAT: ${input.format}` : ''}
${input.quoteKind && input.quotedCost != null ? `Angebot: ${input.quoteKind} für ${input.quotedCost} Coins. Sage die Kosten klar.` : ''}`;

  if (getOpenAiApiKey()) {
    try {
      const history = input.messages.slice(-12).map((m) => ({
        role: m.role === 'system' ? 'system' : m.role,
        content: m.content,
      }));
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getOpenAiApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: system }, ...history],
          max_tokens: 700,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices: { message: { content: string } }[] };
        const content = data.choices[0]?.message?.content?.trim();
        if (content) {
          const extras = [input.warning, input.format].filter(Boolean);
          return extras.length ? `${content}\n\n${extras.join('\n')}` : content;
        }
      }
    } catch {
      /* fallback */
    }
  }

  if (isProduction()) {
    throw new ServiceError(503, 'AI_UNAVAILABLE', 'Nexter benötigt OPENAI_API_KEY.');
  }

  if (isDevMode()) {
    return devReply(input);
  }

  throw new ServiceError(503, 'AI_UNAVAILABLE', 'Nexter ist nicht verfügbar.');
}

function devReply(input: {
  ctx: Awaited<ReturnType<typeof buildNexterContext>>;
  warning: string | null;
  format: string | null;
  messages: NexterChatMessage[];
  quoteKind?: NexterQuoteKind;
  quotedCost?: number | null;
}): string {
  const last = input.messages[input.messages.length - 1]?.content ?? '';
  const parts: string[] = [];
  if (detectAnalyzeIntent(last) || /projekt|farben/i.test(last)) {
    parts.push(
      input.ctx.hasDna
        ? `Zu deinem Creator-Projekt: DNA „${input.ctx.dnaName}“ v${input.ctx.dnaVersion ?? '?'} (${input.ctx.styleDirection ?? 'Stil offen'}), Farben ${input.ctx.primaryColors.join(', ') || 'ohne Primärfarbe'}${input.ctx.mascot ? `, Figur ${input.ctx.mascot}` : ''}${input.ctx.dnaSource === 'project' ? ' — Projekt-DNA' : input.ctx.dnaSource === 'active' ? ' — aktive User-DNA' : ''}.`
        : 'Ich sehe noch keine Creator DNA. Ohne DNA kann ich kein konsistentes Branding vorbereiten.'
    );
    if (input.ctx.projectName) parts.push(`Aktives Projekt: ${input.ctx.projectName}.`);
    if (input.ctx.assetInventory?.length) {
      parts.push(`Vorhanden: ${input.ctx.assetInventory.join(', ')}.`);
    } else {
      parts.push('In diesem Projekt sind noch keine aggregierten Assets hinterlegt.');
    }
    if (input.ctx.missingAssets[0]) parts.push(`Dir fehlt noch: ${input.ctx.missingAssets[0]}.`);
    if (input.ctx.locks?.colors) parts.push('Farben sind gesperrt.');
    if (input.ctx.locks?.character || input.ctx.locks?.mascot) parts.push('Figur ist gesperrt.');
    if (input.ctx.locks?.style) parts.push('Stil ist gesperrt.');
    parts.push(`Coins: ${input.ctx.coinBalance}.`);
  } else if (input.quoteKind && input.quotedCost != null) {
    parts.push(
      `Ich kann daraus ${input.quoteKind === 'streamset' ? 'ein komplettes Streamset' : input.quoteKind === 'mockup' ? 'ein Lifestyle-Mockup' : input.quoteKind === 'animation' ? 'eine Animation (Intro/Outro/Loop/Stinger)' : input.quoteKind === 'text' ? 'ein Content-Paket (Hook, Titel, Caption, Hashtags, CTA)' : `ein ${input.quoteKind}`} erstellen. Kosten: ${input.quotedCost} Coins. ${/änder|dunkler|aggressiv|variante|facecam/i.test(last) ? 'Das ist eine KI-Variante auf Basis des bestehenden Designs, keine Pixel-genaue Layer-Bearbeitung. ' : ''}Es startet erst, wenn du auf Erstellen klickst.`
    );
  } else if (detectOpenStudio(last)) {
    parts.push('Ich öffne das Studio über die Aktion unter dieser Nachricht.');
  } else {
    parts.push(
      input.ctx.hasDna
        ? `Deine DNA „${input.ctx.dnaName}“ ist aktiv. ${input.ctx.coinBalance} Coins.`
        : `Keine DNA hinterlegt. ${input.ctx.coinBalance} Coins.`
    );
  }
  if (input.warning) parts.push(input.warning);
  if (input.format) parts.push(input.format);
  return parts.join(' ');
}
