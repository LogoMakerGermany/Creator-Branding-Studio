import { randomUUID } from 'node:crypto';
import {
  parseMockupIntent,
  mockupNeedsFollowUp,
  parseAnimationIntent,
  animationNeedsFollowUp,
  animationStudioPath,
  parseHighlightIndex,
  parseTextIntent,
  parseSocialIntent,
  socialNeedsFollowUp,
  detectSocialPlannerIntent,
  detectCalendarPlanningIntent,
  parseCalendarPlanningIntent,
  buildWeeklyContentPlanProposal,
  parseMusicIntent,
  musicNeedsFollowUp,
  detectMusicChangeIntent,
  musicStudioPath,
  musicGenMaxDurationSec,
  checkMusicDuration,
  parseVoiceIntent,
  voiceNeedsFollowUp,
  detectVoiceChangeIntent,
  voiceStudioPath,
  parseLogoIntent,
  logoNeedsFollowUp,
  parseBannerIntent,
  bannerNeedsFollowUp,
  parseFacecamIntent,
  facecamNeedsFollowUp,
  parseOverlayIntent,
  overlayNeedsFollowUp,
  parseStickerIntent,
  stickerNeedsFollowUp,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_THREE_PART_COIN_COST,
  NEXTER_STUDIO_PATHS,
  coinCostForStreamsetSelection,
  buildNexterGreeting,
  nexterReplyLanguageInstruction,
  detectNameBasedLogoHelp,
  detectKnownFactFollowUp,
  detectDnaChangeScope,
  detectStudioChangeScope,
  dnaUpdateConfirmationPrompt,
  describeDnaContinuity,
  formatLogoDirectionReply,
  suggestLogoDirections,
  formatColorsForNexter,
  messageAsksExactColorCode,
  followOnAssetLabel,
  parseVideoStudioPrep,
  parseVideoClosureCommand,
  isValidCaption,
  defaultEditPlan,
  type NexterChatMessage,
  type NexterQuoteKind,
  type NexterSession,
} from '@ucbs/shared';
import {
  isDevMode,
  isProduction,
  getOpenAiApiKey,
  getNexterChatModel,
  isNexterChatProviderAvailable,
} from '../../config/env.js';
import { dsGet, dsSet, dsDelete, dsList } from '../../lib/data-store.js';
import { ServiceError } from '../../lib/errors.js';
import { isPaidProviderTestBlocked } from '../../lib/media-providers.js';
import { consumeNexterChatProviderSlot } from '../../lib/provider-gate.js';
import {
  intentAllowsFormatFallback,
  intentAllowsQuote,
  resolveNexterConversationIntent,
  type NexterConversationIntent,
} from './conversation-intent.js';
import { buildNexterSystemPrompt, stripUnsolicitedCreatorCta } from './conversation-prompt.js';
import { buildNexterContext } from './context.service.js';
import { listMemory, memoryAsPrompt, storeMemory } from './memory.service.js';
import { createQuote } from './quotes.service.js';
import { updateNexterPreferencesForUser } from './preferences.service.js';
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
  navigationStudioReply,
  openStudioAction,
  studioOpenLabel,
  recommendFormat,
  recordOwnedByUser,
  warnBadSettings,
  detectFakeDetectionRequest,
  detectShowHighlights,
  detectMakeShort,
  detectAnalyzeVideo,
  detectExternalPublishIntent,
  detectFileCloudIntent,
  detectLayoutStudioIntent,
  quoteActions,
  detectSecretProbe,
  detectOwnershipBypass,
  detectFreeCoinPromiseRequest,
  detectSupportIntent,
  detectCoinQuestion,
  detectChatConfirmIntent,
  detectContinueProject,
  detectEphemeralLanguage,
  detectLanguagePreferenceWrite,
  looksLikeConstraintFollowUp,
  pendingKindFromHistory,
  defaultStreamsetQuoteKeys,
} from './tools.service.js';
import { getVideoProject, saveEditPlan, saveSubtitleEdits } from '../media.service.js';
import { getJob, getJobsByUser } from '../ai.service.js';
import { generateCompositeMockup, getMockup } from '../mockup.service.js';
import { listSocialPosts, updateSocialPost } from '../social.service.js';
import { getRecentUserFiles, getUserFile, listUserFiles } from '../file-cloud.service.js';
import { applyNexterLayoutCommand } from '../layout.service.js';
import { listProjects } from '../project.service.js';
import {
  formatPlanningDigest,
  getUpcomingPlanningItems,
  listTodayPlanningItems,
  listWeekPlanningItems,
} from '../planning.service.js';

const COLLECTION = 'nexterSessions';
const MAX_NEXTER_MESSAGES = 60;
const NEXTER_CHAT_PROVIDER_HISTORY = 8;
const NEXTER_CHAT_MAX_OUTPUT_TOKENS = 700;
const NEXTER_CHAT_TIMEOUT_MS = 45_000;
const liveNexterChatInFlight = new Set<string>();

function shouldCallLiveNexterChatProvider(): boolean {
  return (
    isNexterChatProviderAvailable() &&
    !isPaidProviderTestBlocked() &&
    !process.env.NODE_TEST
  );
}

async function fetchNexterChatCompletion(
  system: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  const key = getOpenAiApiKey();
  if (!key) {
    throw new ServiceError(503, 'AI_UNAVAILABLE', 'AI PROVIDER NOT CONFIGURED');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEXTER_CHAT_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: getNexterChatModel(),
        messages: [{ role: 'system', content: system }, ...history],
        max_tokens: NEXTER_CHAT_MAX_OUTPUT_TOKENS,
      }),
    });
    if (!res.ok) {
      throw new ServiceError(503, 'AI_PROVIDER_ERROR', `OpenAI-Fehler (${res.status})`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new ServiceError(503, 'AI_INVALID_RESPONSE', 'Leere Modellantwort');
    }
    return content;
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ServiceError(503, 'AI_TIMEOUT', 'Nexter-Chat zeitüberschritten');
    }
    throw new ServiceError(503, 'AI_PROVIDER_ERROR', 'OpenAI-Fehler');
  } finally {
    clearTimeout(timer);
  }
}

function capSessionMessages(session: NexterSession): void {
  if (session.messages.length <= MAX_NEXTER_MESSAGES) return;
  const head = session.messages[0];
  session.messages = [head, ...session.messages.slice(-(MAX_NEXTER_MESSAGES - 1))];
}

async function persistSession(session: NexterSession): Promise<void> {
  capSessionMessages(session);
  session.updatedAt = new Date().toISOString();
  await dsSet(COLLECTION, session.id, session as unknown as Record<string, unknown>);
}

function quoteUiExtras(quote: { expiresAt: string; coinCost?: number }, coinBalance: number) {
  return { expiresAt: quote.expiresAt, coinBalance, coinCost: quote.coinCost };
}

function insufficientCoinsPrefix(balance: number, cost: number): string {
  if (balance >= cost) return '';
  return `Nicht genügend Coins. Benötigt: ${cost}, vorhanden: ${balance}, fehlend: ${cost - balance}. Es wurde nichts abgebucht. Coin-Kauf ist derzeit nicht verfügbar. `;
}

function greeting(ctx: { addressAs?: string; language?: string; contextLine: string }): NexterChatMessage {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    role: 'assistant',
    content: buildNexterGreeting({
      addressAs: ctx.addressAs,
      language: ctx.language,
      contextLine: ctx.contextLine,
    }),
    createdAt: now,
    suggestions: ['Was weißt du über mein aktuelles Creator-Projekt?', 'Ich möchte daraus ein Logo machen.', 'Öffne das Logo Studio.'],
  };
}

export { greeting as buildNexterSessionGreeting };

export async function getNexterSessionForUser(sessionId: string, userId: string): Promise<NexterSession | null> {
  const row = await dsGet(COLLECTION, sessionId);
  return recordOwnedByUser(row as unknown as NexterSession | null, userId);
}

export async function getOrCreateNexterSession(userId: string): Promise<NexterSession> {
  const sessions = await dsList(COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc', limit: 1 });
  const existing = sessions[0];
  if (existing) {
    const session = existing as unknown as NexterSession;
    capSessionMessages(session);
    return session;
  }

  const now = new Date().toISOString();
  const ctx = await buildNexterContext(userId).catch(() => null);
  const ctxLine = ctx?.hasDna
    ? `DNA „${ctx.dnaName}“ ist aktiv, ${ctx.coinBalance} Coins.`
    : `Du hast ${ctx?.coinBalance ?? 0} Coins. Eine Creator DNA fehlt noch.`;
  const session: NexterSession = {
    id: randomUUID(),
    userId,
    messages: [
      greeting({
        addressAs: ctx?.addressAs,
        language: ctx?.language,
        contextLine: ctxLine,
      }),
    ],
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
    messages: [
      greeting({
        addressAs: ctx?.addressAs,
        language: ctx?.language,
        contextLine: ctxLine,
      }),
    ],
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
  await persistSession(session);
  return session;
}

export async function nexterChat(
  userId: string,
  message: string,
  meta?: { path?: string; hint?: string; projectId?: string; fileId?: string }
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
  if (meta?.projectId && !ctx.projectId) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Dieses Projekt gehört nicht zu deinem Konto. Nexter arbeitet nur mit eigenen Projekten.',
      createdAt: new Date().toISOString(),
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Projekte öffnen', path: NEXTER_STUDIO_PATHS.projects }],
    });
    await persistSession(session);
    return session;
  }
  const pref = extractPreference(message);
  if (pref) {
    const skipColorPref = pref.key === 'preferredColor' && ctx.locks?.colors;
    const skipStylePref = pref.key === 'preferredStyle' && ctx.locks?.style;
    if (!skipColorPref && !skipStylePref) {
      await storeMemory(userId, pref.key, pref.value, 'preference').catch(() => undefined);
    }
  }
  const languageWrite = detectLanguagePreferenceWrite(message);
  if (languageWrite) {
    await updateNexterPreferencesForUser(userId, { language: languageWrite }).catch(() => undefined);
    ctx.language = languageWrite;
  }

  const fileIdClaim =
    meta?.fileId ||
    message.match(/diese datei\s*\(\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s*\)/i)?.[1] ||
    message.match(/\bfile(?:[- ]?id)\s*[:=]\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i)?.[1];
  if (fileIdClaim && !(await getUserFile(fileIdClaim, userId))) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Diese Datei gehört nicht zu deinem Konto. Nexter verwendet nur eigene Dateien — der Datei-Hinweis allein reicht nicht als Berechtigung.',
      createdAt: new Date().toISOString(),
      actions: [
        {
          id: randomUUID(),
          tool: 'open_studio',
          label: 'Datei Cloud öffnen',
          path: NEXTER_STUDIO_PATHS.files,
        },
      ],
    });
    await persistSession(session);
    return session;
  }

  if (detectSecretProbe(message)) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: 'Das gebe ich nicht preis. API-Keys, Secrets und Tokens bleiben intern.',
      createdAt: new Date().toISOString(),
    });
    await persistSession(session);
    return session;
  }

  if (detectOwnershipBypass(message)) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Das geht nicht. Nexter lädt keine fremden Dateien, Projekte oder Sessions — auch nicht, wenn du die Regeln ignorieren willst.',
      createdAt: new Date().toISOString(),
    });
    await persistSession(session);
    return session;
  }

  const supportIntent = detectSupportIntent(message);
  if (supportIntent) {
    const params = new URLSearchParams({ type: supportIntent.type });
    if (supportIntent.category) params.set('category', supportIntent.category);
    const claimedId = message.match(
      /\b(?:request[-_]?id)\s*[:=]?\s*([a-zA-Z0-9._-]{8,64})\b/i
    )?.[1];
    if (claimedId) params.set('requestId', claimedId);
    if (meta?.path) params.set('route', meta.path.slice(0, 200));
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Ich bin kein Support-Mitarbeiter und lege keine Anfrage still aus dem Chat an. Im Support-Hub kannst du Feedback, einen Fehler oder eine Support-Anfrage selbst absenden. Es gibt keine zugesicherte Antwortzeit.',
      createdAt: new Date().toISOString(),
      actions: [
        {
          id: randomUUID(),
          tool: 'open_studio',
          label: 'Support öffnen',
          path: `/support?${params.toString()}`,
        },
      ],
    });
    await persistSession(session);
    return session;
  }

  if (detectFreeCoinPromiseRequest(message)) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: `Ich kann keine Coins vergeben oder dein Guthaben ändern. Aktuell: ${ctx.coinBalance} Coins. Coin-Kauf ist derzeit nicht verfügbar.`,
      createdAt: new Date().toISOString(),
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Coins öffnen', path: NEXTER_STUDIO_PATHS.coins }],
    });
    await persistSession(session);
    return session;
  }

  if (detectCoinQuestion(message)) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: `Du hast ${ctx.coinBalance} Coins. Kostenpflichtige Aktionen brauchen ein Angebot und deine Bestätigung. Coin-Kauf ist derzeit nicht verfügbar — ich öffne kein Stripe oder PayPal.`,
      createdAt: new Date().toISOString(),
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Coins öffnen', path: NEXTER_STUDIO_PATHS.coins }],
    });
    await persistSession(session);
    return session;
  }

  if (detectChatConfirmIntent(message)) {
    const pending = (ctx.pendingQuotes ?? []).filter((q) => q.kind);
    const expired = pending.some((q) => q.expired);
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: expired
        ? 'Das Angebot ist abgelaufen. Bitte ein neues Angebot anfragen — ich starte nichts aus dem Chat und buche keine Coins.'
        : pending.length
          ? `Bitte bestätige über „Erstellen“. Ich buche keine Coins durch eine Chat-Nachricht. Du hast ${ctx.coinBalance} Coins.`
          : 'Es gibt kein offenes Angebot. Sag zuerst, was erstellt werden soll — Bestätigen geht nur über die Schaltfläche.',
      createdAt: new Date().toISOString(),
    });
    await persistSession(session);
    return session;
  }

  if (detectContinueProject(message)) {
    const wantsLatest = /letzten?/.test(message.toLowerCase());
    if (ctx.projectCount === 0) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: 'Ich sehe noch kein eigenes Projekt. Lege zuerst eins an — fremde Projekte nutze ich nicht.',
        createdAt: new Date().toISOString(),
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Projekte öffnen', path: NEXTER_STUDIO_PATHS.projects }],
      });
    } else if (ctx.projectCount > 1 && !wantsLatest && !ctx.projectName) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: `Welches Projekt? Du hast mehrere: ${ctx.projectNames.join(', ')}. Ich wähle nicht zufällig.`,
        createdAt: new Date().toISOString(),
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Projekte öffnen', path: NEXTER_STUDIO_PATHS.projects }],
      });
    } else {
      const name = ctx.projectName || ctx.projectNames[0];
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: name
          ? `Wir machen bei „${name}“ weiter. Kein Job, keine Coins — sag, was als Nächstes soll.`
          : 'Welches eigene Projekt meinst du?',
        createdAt: new Date().toISOString(),
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Projekte öffnen', path: NEXTER_STUDIO_PATHS.projects }],
      });
    }
    await persistSession(session);
    return session;
  }

  const locked = detectLockedTraitOverride(message, ctx);
  if (locked) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: locked,
      createdAt: new Date().toISOString(),
      suggestions: ['Creator DNA öffnen', 'Sperre in der DNA ändern'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Creator DNA öffnen', path: NEXTER_STUDIO_PATHS.dna }],
    });
    await persistSession(session);
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
    await persistSession(session);
    return session;
  }

  if (detectCalendarPlanningIntent(message) || detectSocialPlannerIntent(message)) {
    const parsed = parseCalendarPlanningIntent(message);
    const calendarActions = [
      {
        id: randomUUID(),
        tool: 'open_studio' as const,
        label: 'Content-Kalender öffnen',
        path: NEXTER_STUDIO_PATHS.calendar,
      },
      {
        id: randomUUID(),
        tool: 'open_studio' as const,
        label: 'Internen Planer öffnen',
        path: `${NEXTER_STUDIO_PATHS.social}?tab=planner`,
      },
    ];
    const noPublish =
      ' Intern geplant heißt nur: vorgemerkt in NEXTER — kein automatisches Publishing auf TikTok, YouTube, Instagram, Twitch oder Discord.';

    if (parsed.followUpQuestion) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: parsed.followUpQuestion + noPublish,
        createdAt: new Date().toISOString(),
        suggestions: ['Was steht heute an?', 'Was habe ich diese Woche geplant?'],
        actions: calendarActions,
      });
      await persistSession(session);
      return session;
    }

    if (parsed.kind === 'plan-proposal') {
      const preferred = ctx.preferredPlatforms?.filter(Boolean) ?? [];
      const proposalPlatforms = parsed.platform
        ? [parsed.platform, ...preferred.filter((p) => p !== parsed.platform)]
        : preferred;
      const proposal = buildWeeklyContentPlanProposal(proposalPlatforms.length ? proposalPlatforms : undefined);
      const dnaNote = ctx.dnaName
        ? ` Stil-Kontext aus Creator DNA (${ctx.dnaName}${ctx.styleDirection ? `, ${ctx.styleDirection}` : ''}) — DNA wird nicht geändert.`
        : '';
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: `${proposal}\n${preferred.length ? `Priorität aus deinen Vorlieben: ${preferred.join(', ')}.` : ''}${dnaNote} Kein AI-Job, keine Coins.${noPublish}`,
        createdAt: new Date().toISOString(),
        suggestions: ['Öffne den Content-Kalender', 'Schreib mir einen TikTok-Post.'],
        actions: calendarActions,
      });
      await persistSession(session);
      return session;
    }

    if (parsed.kind === 'today' || parsed.kind === 'week' || parsed.kind === 'upcoming') {
      const items =
        parsed.kind === 'today'
          ? await listTodayPlanningItems(userId)
          : parsed.kind === 'upcoming'
            ? await getUpcomingPlanningItems(userId, 5)
            : await listWeekPlanningItems(userId, /nächste woche/.test(message.toLowerCase()));
      const filtered = parsed.platform ? items.filter((i) => i.platform === parsed.platform) : items;
      const heading =
        parsed.kind === 'today'
          ? 'Heute intern geplant:'
          : parsed.kind === 'upcoming'
            ? 'Als Nächstes intern geplant:'
            : 'Diese Woche intern geplant:';
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: formatPlanningDigest(filtered, heading) + noPublish,
        createdAt: new Date().toISOString(),
        suggestions: ['Was steht heute an?', 'Öffne den Content-Kalender'],
        actions: calendarActions,
      });
      await persistSession(session);
      return session;
    }

    if (parsed.kind === 'schedule' || parsed.kind === 'reschedule') {
      const posts = await listSocialPosts(userId);
      let candidate = parsed.wantsLastPost
        ? [...posts].find((p) => !parsed.platform || p.platform === parsed.platform) ?? posts[0]
        : posts.find((p) => parsed.platform && p.platform === parsed.platform && p.plannerStatus === 'scheduled') ??
          posts.find((p) => parsed.platform && p.platform === parsed.platform);
      if (!candidate) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content:
            'Ich finde keinen eigenen Post zum intern Planen. Erstelle zuerst Content im Social Studio — fremde Posts nutze ich nicht. Kein Job, keine Coins.' +
            noPublish,
          createdAt: new Date().toISOString(),
          actions: calendarActions,
        });
        await persistSession(session);
        return session;
      }
      if (!parsed.scheduledAt) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: 'Für welchen Tag und welche Uhrzeit soll ich intern planen?' + noPublish,
          createdAt: new Date().toISOString(),
          actions: calendarActions,
        });
        await persistSession(session);
        return session;
      }
      const updated = await updateSocialPost(candidate.id, userId, { scheduledAt: parsed.scheduledAt });
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: `Intern geplant für ${new Date(updated.scheduledAt || parsed.scheduledAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} (${updated.platform}).${noPublish}`,
        createdAt: new Date().toISOString(),
        suggestions: ['Was steht heute an?', 'Öffne den Content-Kalender'],
        actions: calendarActions,
      });
      await persistSession(session);
      return session;
    }

    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Das plane ich intern im Social Studio und Content-Kalender. Ein geplanter Beitrag bedeutet nur: für diesen Zeitpunkt vorgemerkt — NEXTER veröffentlicht nichts automatisch auf TikTok, YouTube, Instagram, Twitch oder Discord.',
      createdAt: new Date().toISOString(),
      suggestions: ['Öffne den internen Planer', 'Schreib mir einen TikTok-Post.'],
      actions: calendarActions,
    });
    await persistSession(session);
    return session;
  }

  if (detectFileCloudIntent(message)) {
    const lower = message.toLowerCase();
    const fileActions = [
      {
        id: randomUUID(),
        tool: 'open_studio' as const,
        label: 'Datei Cloud öffnen',
        path: NEXTER_STUDIO_PATHS.files,
      },
    ];
    const logos = await listUserFiles(userId, { category: 'logo' });
    const videos = await listUserFiles(userId, { kind: 'video' });
    const recent = await getRecentUserFiles(userId, { limit: 5 });

    if (/nimm .*logo|letztes logo für|verwende mein logo/.test(lower)) {
      if (logos.length > 1 && !/letztes|letzten/.test(lower)) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: `Ich habe ${logos.length} eigene Logos gefunden. Welches möchtest du verwenden? Fremde Dateien nutze ich nicht.`,
          createdAt: new Date().toISOString(),
          actions: fileActions,
        });
        await persistSession(session);
        return session;
      }
      const logo = logos[0];
      if (!logo) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: 'Ich finde kein eigenes Logo in der Datei Cloud. Fremde Dateien nutze ich nicht.',
          createdAt: new Date().toISOString(),
          actions: fileActions,
        });
      } else {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: `Ich nehme dein letztes eigenes Logo „${logo.name}“. Für ein neues Mockup brauchst du weiterhin ein Angebot — ich starte keinen AI-Job automatisch.`,
          createdAt: new Date().toISOString(),
          actions: [
            ...fileActions,
            {
              id: randomUUID(),
              tool: 'open_studio' as const,
              label: 'Mockup Studio öffnen',
              path: NEXTER_STUDIO_PATHS.mockup,
            },
          ],
        });
      }
      await persistSession(session);
      return session;
    }

    if (/welche dateien gehören|dateien .*projekt/.test(lower)) {
      const projects = await listProjects(userId);
      const named = projects.find((p) => lower.includes(p.name.toLowerCase()));
      const project = named || (ctx.projectId ? projects.find((p) => p.id === ctx.projectId) : undefined);
      if (!project) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: 'Zu welchem eigenen Projekt soll ich die Dateien zeigen?',
          createdAt: new Date().toISOString(),
          actions: fileActions,
        });
      } else {
        const files = await listUserFiles(userId, { projectId: project.id });
        const lines = files.slice(0, 8).map((f) => `- ${f.name} (${f.category})`);
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: files.length
            ? `Eigene Dateien in „${project.name}“:\n${lines.join('\n')}`
            : `Keine eigenen Dateien in „${project.name}“.`,
          createdAt: new Date().toISOString(),
          actions: fileActions,
        });
      }
      await persistSession(session);
      return session;
    }

    if (/streamset/.test(lower)) {
      const files = (await listUserFiles(userId)).filter(
        (f) => /streamset|overlay|banner|sticker|facecam|offline|panel/i.test(`${f.name} ${f.category} ${f.sourceJobId ?? ''}`)
      );
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: files.length
          ? `Eigene Streamset-bezogene Dateien:\n${files.slice(0, 8).map((f) => `- ${f.name}`).join('\n')}`
          : 'Keine eigenen Streamset-Dateien gefunden. Fremde Dateien nutze ich nicht.',
        createdAt: new Date().toISOString(),
        actions: fileActions,
      });
      await persistSession(session);
      return session;
    }

    if (/letztes video|öffne mein letztes video/.test(lower)) {
      const video = videos[0];
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: video
          ? `Dein letztes eigenes Video: „${video.name}“.`
          : 'Ich finde kein eigenes Video in der Datei Cloud.',
        createdAt: new Date().toISOString(),
        actions: [
          ...fileActions,
          { id: randomUUID(), tool: 'open_studio' as const, label: 'Video Studio öffnen', path: NEXTER_STUDIO_PATHS.video },
        ],
      });
      await persistSession(session);
      return session;
    }

    if (/letztes logo|wo ist mein letztes logo/.test(lower)) {
      if (logos.length > 1 && !/letztes|letzten/.test(lower)) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: `Ich habe ${logos.length} eigene Logos gefunden. Welches möchtest du verwenden?`,
          createdAt: new Date().toISOString(),
          actions: fileActions,
        });
      } else {
        const logo = logos[0];
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: logo ? `Dein letztes eigenes Logo: „${logo.name}“.` : 'Kein eigenes Logo in der Datei Cloud.',
          createdAt: new Date().toISOString(),
          actions: fileActions,
        });
      }
      await persistSession(session);
      return session;
    }

    const lines = recent.map((f) => `- ${f.name} (${f.category})`);
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: recent.length
        ? `Deine letzten eigenen Dateien:\n${lines.join('\n')}`
        : 'Noch keine eigenen Dateien. Fremde Dateien zeige ich nicht.',
      createdAt: new Date().toISOString(),
      actions: fileActions,
    });
    await persistSession(session);
    return session;
  }

  if (detectLayoutStudioIntent(message)) {
    const result = await applyNexterLayoutCommand(userId, message, {
      projectId: ctx.projectId || meta?.projectId,
      dnaId: ctx.dnaId,
    });
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: result.message,
      createdAt: new Date().toISOString(),
      suggestions: result.followUp
        ? ['Facecam', 'Gameplay', 'Chat', 'Logo']
        : ['Öffne das Layout Studio', 'Setz mein Logo oben rechts'],
      actions: [
        {
          id: randomUUID(),
          tool: 'open_studio',
          label: 'Layout Studio öffnen',
          path: `${NEXTER_STUDIO_PATHS.layout}?layoutId=${encodeURIComponent(result.layout.id)}`,
        },
      ],
    });
    await persistSession(session);
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
    await persistSession(session);
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
    await persistSession(session);
    return session;
  }

  if (detectShowHighlights(message)) {
    const list = ctx.videoHighlights ?? [];
    const content = list.length
      ? `Echte Highlight-Kandidaten aus der Analyse:\n${list
          .map(
            (h, i) =>
              `${i + 1}. ${h.start.toFixed(1)}s–${h.end.toFixed(1)}s · Score ${h.score} — ${h.reason || h.label}. Dieser Abschnitt wirkt aufgrund der erkannten Aktivität als möglicher Highlight-Kandidat.`
          )
          .join('\n')}`
      : 'Es liegt noch keine lokale Analyse vor. Öffne das Video Studio und starte „Highlights finden“. Ich erfinde keine Kill-Events.';
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      suggestions: list.length ? ['Mach Highlight 1 zu einem Short', 'Öffne das Video Studio'] : ['Öffne das Video Studio'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path: NEXTER_STUDIO_PATHS.video }],
    });
    await persistSession(session);
    return session;
  }

  if (detectAnalyzeVideo(message)) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Ich öffne das Video Studio. Lokale Szenen/Pausen laufen ohne KI-Key. Whisper-Transkript ist provider-gated — ich starte das nicht automatisch.',
      createdAt: new Date().toISOString(),
      suggestions: ['Lokal analysieren', 'Öffne das Video Studio'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path: NEXTER_STUDIO_PATHS.video }],
    });
    await persistSession(session);
    return session;
  }

  const videoClosure = parseVideoClosureCommand(message);
  if (videoClosure && (videoClosure.transition || videoClosure.caption || videoClosure.wantPreview) && !videoClosure.wantTranscribe) {
    const pid = ctx.videoProjectId;
    const studioPath = NEXTER_STUDIO_PATHS.video;
    const params = new URLSearchParams();
    if (pid) params.set('projectId', pid);
    if (videoClosure.wantPreview) params.set('preview', '1');
    const path = params.toString() ? `${studioPath}?${params.toString()}` : studioPath;
    const bits: string[] = [];
    if (!pid) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content:
          'Dafür brauche ich ein Video in deinem Video Studio. Lade zuerst eines hoch — ich starte keinen Export und keine Transkription.',
        createdAt: new Date().toISOString(),
        suggestions: ['Öffne das Video Studio'],
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path: studioPath }],
      });
      await persistSession(session);
      return session;
    }
    const project = await getVideoProject(pid, userId);
    if (!project) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: 'Ich finde dein Video-Projekt nicht. Öffne das Video Studio mit einem eigenen Upload.',
        createdAt: new Date().toISOString(),
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path: studioPath }],
      });
      await persistSession(session);
      return session;
    }
    if (videoClosure.transition) {
      const plan = {
        ...(project.editPlan ?? defaultEditPlan(project.duration)),
        transition: videoClosure.transition,
      };
      await saveEditPlan(pid, userId, plan);
      bits.push(videoClosure.transition === 'fade' ? 'weiche Überblendung (Fade)' : 'harter Schnitt');
    }
    if (videoClosure.caption) {
      if (!isValidCaption(videoClosure.caption, project.duration)) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: 'Die Caption-Zeiten passen nicht zur Videodauer. Start muss ≥ 0 und Ende nach Start, innerhalb der Dauer liegen. Nichts wurde gespeichert.',
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path }],
        });
        await persistSession(session);
        return session;
      }
      await saveSubtitleEdits(pid, userId, [...(project.subtitles ?? []), videoClosure.caption]);
      bits.push(`Caption „${videoClosure.caption.text}“ ${videoClosure.caption.start}s–${videoClosure.caption.end}s`);
    }
    if (videoClosure.wantPreview) bits.push('Vorschau im Studio (nicht pixelidentisch zum Export)');
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: `Ich habe die Video-Konfiguration vorbereitet${bits.length ? `: ${bits.join(', ')}` : ''}. Es wird nichts exportiert und keine Transkription gestartet.`,
      createdAt: new Date().toISOString(),
      suggestions: ['Zeig mir erst eine Vorschau', 'Lokal exportieren'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path }],
    });
    await persistSession(session);
    return session;
  }

  const animLower = message.toLowerCase();
  const animationChange =
    Boolean(ctx.lastAnimationId) &&
    /langsamer|schneller|drehrichtung|nur \d+\s*(s|sek)|hintergrund transparent|neue variante|version für tiktok/.test(
      animLower
    );
  if (animationChange && ctx.lastAnimationId) {
    const parsed = parseAnimationIntent(message);
    const quote = await createQuote(userId, 'animation', meta?.projectId || ctx.projectId, {
      ...parsed,
      message,
      parentJobId: ctx.lastAnimationId,
      changeRequest: true,
      request: message,
    });
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: `${insufficientCoinsPrefix(ctx.coinBalance, quote.coinCost)}Ich bereite eine kostenpflichtige Animations-Änderung vor (${quote.coinCost} Coins). Source und Plan bleiben erhalten, DNA wird nicht überschrieben. Es startet erst nach Bestätigung.`,
      createdAt: new Date().toISOString(),
      suggestions: ['Animation Studio öffnen', 'Abbrechen'],
      actions: [
        ...quoteActions('animation', quote.id, true, quoteUiExtras(quote, ctx.coinBalance)),
        { id: randomUUID(), tool: 'open_studio', label: 'Animation Studio öffnen', path: animationStudioPath(parsed) },
      ],
    });
    await persistSession(session);
    return session;
  }

  if (detectMusicChangeIntent(message) && ctx.lastMusicId && (!ctx.lastAnimationId || /musik|song|track|bass|episch|härter/.test(animLower))) {
    const parsed = parseMusicIntent(message, { styleDirection: ctx.styleDirection, dnaName: ctx.dnaName });
    const quote = await createQuote(userId, 'music', meta?.projectId || ctx.projectId, {
      ...parsed,
      message,
      parentJobId: ctx.lastMusicId,
      changeRequest: true,
      request: message,
    });
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: `${insufficientCoinsPrefix(ctx.coinBalance, quote.coinCost)}Ich bereite eine kostenpflichtige Musik-Änderung vor (${quote.coinCost} Coins). DNA bleibt unverändert. Es startet erst nach Bestätigung.`,
      createdAt: new Date().toISOString(),
      suggestions: ['Musik Studio öffnen', 'Abbrechen'],
      actions: [
        ...quoteActions('music', quote.id, true, quoteUiExtras(quote, ctx.coinBalance)),
        { id: randomUUID(), tool: 'open_studio', label: 'Musik Studio öffnen', path: musicStudioPath({ durationSec: parsed.duration, purpose: parsed.purpose, genre: parsed.genre, mood: parsed.mood, energy: parsed.energy }) },
      ],
    });
    await persistSession(session);
    return session;
  }

  if (detectVoiceChangeIntent(message) && ctx.lastVoiceId) {
    const parsed = parseVoiceIntent(message, { language: ctx.language, voiceCatalogId: undefined });
    const quote = await createQuote(userId, 'voice', meta?.projectId || ctx.projectId, {
      ...parsed,
      message,
      parentJobId: ctx.lastVoiceId,
      changeRequest: true,
      request: message,
    });
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: `${insufficientCoinsPrefix(ctx.coinBalance, quote.coinCost)}Ich bereite eine kostenpflichtige Voice-Änderung vor (${quote.coinCost} Coins). Der Text bleibt erhalten, DNA wird nicht überschrieben. Es startet erst nach Bestätigung.`,
      createdAt: new Date().toISOString(),
      suggestions: ['Voice Studio öffnen', 'Abbrechen'],
      actions: [
        ...quoteActions('voice', quote.id, true, quoteUiExtras(quote, ctx.coinBalance)),
        { id: randomUUID(), tool: 'open_studio', label: 'Voice Studio öffnen', path: voiceStudioPath({ language: parsed.language, voiceCatalogId: parsed.voiceCatalogId }) },
      ],
    });
    await persistSession(session);
    return session;
  }

  if (/hintergrund transparent/.test(animLower) && !detectQuoteKind(message)) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Transparenter Hintergrund gilt in der lokalen Vorschau. Ein späteres Provider-MP4 hat kein Alpha — ich starte keine Generierung.',
      createdAt: new Date().toISOString(),
      actions: [
        {
          id: randomUUID(),
          tool: 'open_studio',
          label: 'Animation Studio öffnen',
          path: animationStudioPath({ transparent: true }),
        },
      ],
    });
    await persistSession(session);
    return session;
  }

  const videoPrep = parseVideoStudioPrep(message);
  if (videoPrep && detectQuoteKind(message) !== 'sticker' && detectQuoteKind(message) !== 'mockup') {
    const pid = ctx.videoProjectId;
    const studioPath = videoPrep.studio === 'shorts' ? NEXTER_STUDIO_PATHS.shorts : NEXTER_STUDIO_PATHS.video;
    const params = new URLSearchParams();
    if (pid) params.set('projectId', pid);
    if (videoPrep.aspectRatio) params.set('aspect', videoPrep.aspectRatio);
    if (videoPrep.bestSeconds) params.set('end', String(videoPrep.bestSeconds));
    if (videoPrep.cutStart) params.set('start', '3');
    if (videoPrep.wantIntro) params.set('intro', '1');
    if (videoPrep.format) params.set('format', videoPrep.format);
    const path = params.toString() ? `${studioPath}?${params.toString()}` : studioPath;
    const bits: string[] = [];
    if (videoPrep.aspectRatio) bits.push(`Format ${videoPrep.aspectRatio}`);
    if (videoPrep.bestSeconds) bits.push(`erste ${videoPrep.bestSeconds}s als Vorschlag`);
    if (videoPrep.cutStart) bits.push('Anfang kürzen (Vorschlag)');
    if (videoPrep.wantIntro) bits.push('Intro aus deinen Dateien wählen — nur eigene Files');
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: pid
        ? `Ich bereite das ${videoPrep.studio === 'shorts' ? 'Shorts' : 'Video'} Studio für dein aktuelles Video vor${bits.length ? `: ${bits.join(', ')}` : ''}. Es wird nichts exportiert und nichts abgebucht.`
        : 'Dafür brauche ich ein Video in deinem Video Studio. Lade zuerst eines hoch — ich starte keinen Export.',
      createdAt: new Date().toISOString(),
      suggestions: ['Highlights finden', 'Shorts Studio öffnen'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Studio öffnen', path }],
    });
    await persistSession(session);
    return session;
  }

  const changeIntent = detectChangeIntent(message, ctx);
  if (detectStudioChangeScope(message) === 'set') {
    const jobs = await getJobsByUser(userId);
    const batches = new Map<string, string[]>();
    for (const job of jobs) {
      if (job.userId !== userId || !job.batchId || !job.assetKey || !job.imageUrl) continue;
      if (ctx.projectId && job.projectId && job.projectId !== ctx.projectId) continue;
      const keys = batches.get(job.batchId) ?? [];
      if (!keys.includes(job.assetKey)) keys.push(job.assetKey);
      batches.set(job.batchId, keys);
    }
    if (batches.size > 1) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content:
          'Welches Streamset möchtest du ändern? Ich wähle nicht zufällig eins. Das bleibt eine Set-Änderung — nicht deine Creator DNA. Es wird nichts generiert und nichts abgebucht.',
        createdAt: new Date().toISOString(),
        suggestions: ['Streamset öffnen', 'Nur Facecam ändern'],
        actions: [
          { id: randomUUID(), tool: 'open_studio', label: 'Streamset öffnen', path: NEXTER_STUDIO_PATHS.streamset },
        ],
      });
      await persistSession(session);
      return session;
    }
    const entry = [...batches.entries()][0];
    const batchId = entry?.[0];
    const keys = entry?.[1] ?? [];
    if (!batchId || !keys.length) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content:
          'Verstanden — das ist eine Set-Änderung für die zugehörigen Streamset-Assets, nicht nur ein einzelnes Teil und nicht deine Creator DNA. Ich finde gerade kein eigenes Set. Es wird noch nichts generiert und nichts abgebucht.',
        createdAt: new Date().toISOString(),
        suggestions: ['Streamset öffnen', 'Nur Facecam ändern'],
        actions: [
          { id: randomUUID(), tool: 'open_studio', label: 'Streamset öffnen', path: NEXTER_STUDIO_PATHS.streamset },
        ],
      });
      await persistSession(session);
      return session;
    }
    const pricing = coinCostForStreamsetSelection(keys);
    const quote = await createQuote(
      userId,
      'streamset',
      meta?.projectId || ctx.projectId,
      {
        changeRequest: true,
        jobId: batchId,
        request: message,
        selectedKeys: keys,
        scope: 'set',
      },
      pricing.total
    );
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: `${insufficientCoinsPrefix(ctx.coinBalance, quote.coinCost)}Set-Änderung für ${keys.length} eigene Streamset-Assets — nicht deine Creator DNA. Angebot: ${quote.coinCost} Coins. Es wird nichts generiert, bis du bestätigst.`,
      createdAt: new Date().toISOString(),
      suggestions: ['Nur Facecam ändern', 'Creator DNA öffnen'],
      actions: quoteActions('streamset', quote.id, true, quoteUiExtras(quote, ctx.coinBalance)),
    });
    await persistSession(session);
    return session;
  }

  const knownFollowUp = detectKnownFactFollowUp(message, ctx);
  if (knownFollowUp && !changeIntent && !detectQuoteKind(message) && !detectOpenStudio(message)) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: knownFollowUp,
      createdAt: new Date().toISOString(),
      suggestions: ['Beim bekannten Stil bleiben', 'Diesmal etwas anderes'],
    });
    await persistSession(session);
    return session;
  }

  if (detectNameBasedLogoHelp(message)) {
    const help = suggestLogoDirections({
      name: ctx.dnaName || ctx.addressAs || ctx.displayName || '',
      platforms: ctx.preferredPlatforms,
      stylePreferences: ctx.stylePreferences,
      creatorGoals: ctx.creatorGoals,
      dnaStyle: ctx.styleDirection,
      dnaColors: ctx.primaryColors,
      mascot: ctx.mascot,
    });
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: formatLogoDirectionReply(help),
      createdAt: new Date().toISOString(),
      suggestions: help.directions.map((d) => d.title).concat(['Logo Studio öffnen']).slice(0, 4),
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Logo Studio öffnen', path: NEXTER_STUDIO_PATHS.logo }],
    });
    await persistSession(session);
    return session;
  }

  const conversationIntent = resolveNexterConversationIntent(message, session.messages.slice(0, -1), ctx);

  if (conversationIntent.intent === 'SMALLTALK') {
    const reply = stripUnsolicitedCreatorCta(
      await generateNexterReply({
        userId,
        messages: session.messages,
        ctx,
        memory: '',
        path: meta?.path,
        hint: meta?.hint,
        warning: null,
        format: null,
        intent: conversationIntent.intent,
      })
    );
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: reply,
      createdAt: new Date().toISOString(),
      suggestions: [],
    });
    await persistSession(session);
    return session;
  }

  if (conversationIntent.intent === 'NAVIGATION_ACTION') {
    const path = detectOpenStudio(message);
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: path
        ? navigationStudioReply(path)
        : 'Welches Studio soll ich öffnen? Das Öffnen kostet keine Coins.',
      createdAt: new Date().toISOString(),
      suggestions: [],
      actions: path
        ? [openStudioAction(path, studioOpenLabel(path), { autoNavigate: true })]
        : [],
    });
    await persistSession(session);
    return session;
  }

  if (
    conversationIntent.intent === 'AMBIGUOUS' &&
    conversationIntent.confidence === 'HIGH' &&
    !detectQuoteKind(message) &&
    !changeIntent &&
    !detectOpenStudio(message) &&
    !detectDnaChangeScope(message)
  ) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: 'Womit soll ich anfangen – Logo, Streamset, Banner, Intro oder etwas anderes?',
      createdAt: new Date().toISOString(),
      suggestions: ['Mach mir ein Logo.', 'Was fehlt meinem Streamset?', 'Öffne das Logo Studio.'],
    });
    await persistSession(session);
    return session;
  }

  const pendingKind = pendingKindFromHistory(session.messages.slice(0, -1));
  if (
    pendingKind &&
    looksLikeConstraintFollowUp(message) &&
    conversationIntent.intent !== 'PROJECT_ANALYSIS' &&
    conversationIntent.intent !== 'APP_HELP' &&
    conversationIntent.intent !== 'CREATOR_ADVICE' &&
    conversationIntent.intent !== 'MODIFY_ASSET' &&
    conversationIntent.intent !== 'ACCOUNT_OR_SETTINGS'
  ) {
    const priorUser = [...session.messages.slice(0, -1)]
      .reverse()
      .find((row) => row.role === 'user' && detectQuoteKind(row.content));
    if (priorUser) message = `${priorUser.content} ${message}`;
  }

  const incomplete = detectIncompletePrompt(message, ctx);
  const wantsGenerate = Boolean(
    (changeIntent || detectQuoteKind(message)) && intentAllowsQuote(conversationIntent.intent)
  );
  const openPath = detectOpenStudio(message);

  if (
    incomplete &&
    !openPath &&
    !detectAnalyzeIntent(message) &&
    !changeIntent &&
    detectQuoteKind(message) !== 'mockup' &&
    conversationIntent.intent !== 'PROJECT_ANALYSIS' &&
    conversationIntent.intent !== 'APP_HELP' &&
    conversationIntent.intent !== 'CREATOR_ADVICE'
  ) {
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
              path: NEXTER_STUDIO_PATHS.dna,
            },
          ],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'animation' && animationNeedsFollowUp(message) && !changeIntent && !openPath) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Wie soll die Animation aussehen — Rotation, Fade-In oder ein Intro? Und wie lange (1–15 Sekunden)? Ich starte keine kostenpflichtige Generierung, bis das klar ist und du bestätigst.',
      createdAt: new Date().toISOString(),
      suggestions: [
        'Lass mein Logo einmal um die eigene Achse drehen.',
        'Mach daraus ein fünf Sekunden Intro.',
        'Lass das Logo langsam einblenden.',
      ],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Animation Studio öffnen', path: NEXTER_STUDIO_PATHS.animation }],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'music' && musicNeedsFollowUp(message) && !changeIntent && !openPath) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Wofür die Musik — Intro, Background oder Stream? Welcher Stil, und wie lange (1–30 Sekunden)? Ich starte keine kostenpflichtige Generierung, bis das klar ist und du bestätigst.',
      createdAt: new Date().toISOString(),
      suggestions: [
        'Mach mir Musik für mein Intro.',
        'Ich brauche aggressiven Hardcore-Techno.',
        'Ich brauche 20 Sekunden Hintergrundmusik.',
      ],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Musik Studio öffnen', path: NEXTER_STUDIO_PATHS.music }],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'voice' && voiceNeedsFollowUp(message) && !changeIntent && !openPath) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Welchen Text soll ich sprechen? Ich starte keine kostenpflichtige Generierung, bis der Text da ist und du bestätigst.',
      createdAt: new Date().toISOString(),
      suggestions: [
        'Sprich folgenden Text als Voiceover: Willkommen auf meinem Stream.',
        'Mach ein Voiceover: Das Match beginnt gleich.',
      ],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Voice Studio öffnen', path: NEXTER_STUDIO_PATHS.voice }],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'logo' && logoNeedsFollowUp(message, ctx) && !changeIntent && !openPath) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        ctx.hasDna && ctx.dnaName
          ? 'Welche Größe, Form oder Plattform soll das Logo haben? DNA-Farben und Stil übernehme ich als Defaults — ich frage sie nicht erneut.'
          : 'Für ein Logo brauche ich mindestens den Namen. Hast du schon eine Creator DNA, oder soll ich mit Name, Stil und Farben im Logo Studio weitermachen?',
      createdAt: new Date().toISOString(),
      suggestions: ctx.hasDna
        ? ['400 Pixel, im Ring, transparenter Hintergrund.', 'Gamerlogo für Twitch.', 'Öffne das Logo Studio']
        : ['Mach mir ein Gamerlogo mit dem Namen NightWolf.', 'Öffne das Logo Studio'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Logo Studio öffnen', path: NEXTER_STUDIO_PATHS.logo }],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'banner' && bannerNeedsFollowUp(message, ctx) && !changeIntent && !openPath) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Für welches Banner — Twitch, YouTube, TikTok oder Discord? Logo ist optional. DNA-Farben und Stil übernehme ich als Defaults, wenn vorhanden.',
      createdAt: new Date().toISOString(),
      suggestions: ['Mach mir einen Twitch Banner.', 'YouTube Banner passend zu meinem Logo.', 'Öffne das Banner Studio'],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Banner Studio öffnen', path: NEXTER_STUDIO_PATHS.banner }],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'facecam' && facecamNeedsFollowUp(message, ctx) && !changeIntent && !openPath) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Für welche Plattform — Twitch, TikTok, YouTube oder OBS? Logo ist optional. DNA-Farben und Stil übernehme ich als Defaults, wenn vorhanden.',
      createdAt: new Date().toISOString(),
      suggestions: [
        'Mach mir einen transparenten Facecam-Rahmen für Twitch.',
        'TikTok-Facecam passend zu meinem Logo.',
        'Öffne das Facecam Studio',
      ],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Facecam Studio öffnen', path: NEXTER_STUDIO_PATHS.facecam }],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'overlay' && overlayNeedsFollowUp(message, ctx) && !changeIntent && !openPath) {
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        'Für welche Plattform — Twitch, TikTok, YouTube oder OBS? Logo und Facecam sind optional. DNA-Farben und Stil übernehme ich als Defaults, wenn vorhanden.',
      createdAt: new Date().toISOString(),
      suggestions: [
        'Mach mir ein Twitch Overlay.',
        'Ich brauche ein TikTok Gaming Layout.',
        'Öffne das Overlay Studio',
      ],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Overlay Studio öffnen', path: NEXTER_STUDIO_PATHS.overlay }],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'sticker' && stickerNeedsFollowUp(message, ctx) && !changeIntent && !openPath) {
    const parsed = parseStickerIntent(message, {
      dnaName: ctx.dnaName,
      preferredPlatform: ctx.preferredPlatforms?.[0],
    });
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        parsed.followUpQuestion ||
        'Sticker, Badge oder Emote — und für welche Plattform (Twitch, TikTok, YouTube, Discord)? Logo ist optional. DNA-Farben und Stil übernehme ich als Defaults, wenn vorhanden.',
      createdAt: new Date().toISOString(),
      suggestions: [
        'Mach mir einen TikTok-Sticker.',
        'Mach mir ein GG-Badge für Twitch.',
        'Öffne das Sticker Studio',
      ],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Sticker Studio öffnen', path: NEXTER_STUDIO_PATHS.sticker }],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'mockup' && mockupNeedsFollowUp(message, ctx) && !changeIntent && !openPath) {
    const parsed = parseMockupIntent(message, {
      lastLogoId: ctx.lastLogoId,
      lastStickerId: ctx.lastStickerId,
      lastMockupId: ctx.lastMockupId,
      dnaName: ctx.dnaName,
    });
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        parsed.followUpQuestion ||
        'Welches eigene Asset und welches Produkt? Lokal (kostenloses Composite) oder Lifestyle-KI?',
      createdAt: new Date().toISOString(),
      suggestions: [
        'Zeig mein Logo auf einem Hoodie.',
        'Mach mein Logo auf eine schwarze Tasse.',
        'Mach mir eine realistische Lifestyle-Version.',
      ],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Mockup Studio öffnen', path: NEXTER_STUDIO_PATHS.mockup }],
    });
    await persistSession(session);
    return session;
  }

  if (detectQuoteKind(message) === 'text' && socialNeedsFollowUp(message, ctx) && !changeIntent && !openPath) {
    const parsed = parseSocialIntent(message, {
      dnaName: ctx.dnaName,
      lastShortId: ctx.lastShortId,
      lastLogoId: ctx.lastLogoId,
      preferredPlatforms: ctx.preferredPlatforms,
      language: ctx.language,
    });
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content:
        parsed.followUpQuestion ||
        'Für welche Plattform und welches Thema? DNA-Stil und Vorlieben frage ich nicht erneut.',
      createdAt: new Date().toISOString(),
      suggestions: [
        'Schreib mir einen TikTok-Post.',
        'Mach eine Ankündigung für meinen Stream heute Abend.',
        'Schreib mir eine Beschreibung für mein neues YouTube-Video.',
      ],
      actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Social Studio öffnen', path: NEXTER_STUDIO_PATHS.social }],
    });
    await persistSession(session);
    return session;
  }

  let quoteId: string | undefined;
  let quoteExpiresAt: string | undefined;
  let quoteCost: number | undefined;
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
      await persistSession(session);
      return session;
    }
    if ('none' in resolved) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: resolved.none,
        createdAt: new Date().toISOString(),
      });
      await persistSession(session);
      return session;
    }
    const ownedSource = await getJob(resolved.jobId);
    if (!ownedSource || ownedSource.userId !== userId) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: 'Dieses Ergebnis gehört nicht zu deinem Konto. Ich starte keinen Änderungswunsch.',
        createdAt: new Date().toISOString(),
      });
      await persistSession(session);
      return session;
    }
    if (!ctx.hasDna && changeIntent.kind !== 'facecam' && changeIntent.kind !== 'overlay' && changeIntent.kind !== 'sticker' && changeIntent.kind !== 'mockup') {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: 'Dafür brauche ich zuerst deine Creator DNA. Kein Job wurde gestartet.',
        createdAt: new Date().toISOString(),
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Creator DNA öffnen', path: NEXTER_STUDIO_PATHS.dna }],
      });
      await persistSession(session);
      return session;
    }
    quoteKind = changeIntent.kind;
    isChangeQuote = true;
    if (quoteKind === 'mockup') {
      const existing = await getMockup(resolved.jobId, userId);
      if (existing && !existing.lifestyle) {
        try {
          const job = await generateCompositeMockup(userId, {
            category: existing.category,
            colorId: existing.colorId,
            modelLabel: existing.modelLabel,
            placement: existing.placement,
            scalePercent: existing.scalePercent,
            sourceLogoJobId: existing.sourceLogoJobId,
            sourceStickerJobId: existing.sourceStickerJobId,
            sourceBannerJobId: existing.sourceBannerJobId,
            sourceFileId: existing.sourceFileId,
            parentJobId: existing.id,
            request: changeIntent.request,
            projectId: meta?.projectId || ctx.projectId,
          });
          session.messages.push({
            id: randomUUID(),
            role: 'assistant',
            content: `Lokale Mockup-Variante ist fertig (${job.config?.summary ?? job.category}). Keine Coins, kein Provider.`,
            createdAt: new Date().toISOString(),
            actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Mockup Studio öffnen', path: NEXTER_STUDIO_PATHS.mockup }],
          });
          await persistSession(session);
          return session;
        } catch (err) {
          session.messages.push({
            id: randomUUID(),
            role: 'assistant',
            content: err instanceof Error ? err.message : 'Mockup-Änderung fehlgeschlagen.',
            createdAt: new Date().toISOString(),
          });
          await persistSession(session);
          return session;
        }
      }
    }
    const quote = await createQuote(userId, quoteKind, meta?.projectId || ctx.projectId, {
      changeRequest: true,
      jobId: resolved.jobId,
      ...(quoteKind === 'facecam' || quoteKind === 'overlay' || quoteKind === 'sticker' || quoteKind === 'mockup'
        ? { parentJobId: resolved.jobId }
        : {}),
      request: changeIntent.request,
    });
    quoteId = quote.id;
    quoteExpiresAt = quote.expiresAt;
    quoteCost = quote.coinCost;
  } else if (wantsGenerate && !openPath) {
    quoteKind = detectQuoteKind(message)!;
    if (quoteKind !== 'text' && quoteKind !== 'captions' && quoteKind !== 'logo' && quoteKind !== 'banner' && quoteKind !== 'facecam' && quoteKind !== 'overlay' && quoteKind !== 'sticker' && quoteKind !== 'mockup' && !ctx.hasDna) {
      session.messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: 'Dafür brauche ich zuerst deine Creator DNA — sonst kann ich kein konsistentes Branding vorbereiten. Kein Job wurde gestartet.',
        createdAt: new Date().toISOString(),
        actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Creator DNA öffnen', path: NEXTER_STUDIO_PATHS.dna }],
      });
      await persistSession(session);
      return session;
    }
    if (quoteKind === 'banner') {
      const settings = parseBannerIntent(message, {
        dnaName: ctx.dnaName,
        lastLogoId: ctx.lastLogoId,
        lastBannerId: ctx.lastBannerId,
        preferredPlatform: ctx.preferredPlatforms?.[0],
      });
      if (settings.convertFromExisting && !ctx.lastBannerId) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content:
            'Ich finde kein eigenes Ausgangsbanner für die Plattform-Umwandlung. Erstelle zuerst eines im Banner Studio — fremde Banner nutze ich nicht. Kein Job wurde gestartet.',
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Banner Studio öffnen', path: NEXTER_STUDIO_PATHS.banner }],
        });
        await persistSession(session);
        return session;
      }
    }
    if (quoteKind === 'facecam') {
      const settings = parseFacecamIntent(message, {
        dnaName: ctx.dnaName,
        lastLogoId: ctx.lastLogoId,
        lastFacecamId: ctx.lastFacecamId,
        preferredPlatform: ctx.preferredPlatforms?.[0],
      });
      if (settings.convertFromExisting && !ctx.lastFacecamId) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content:
            'Ich finde keine eigene Ausgangs-Facecam für die Plattform-Umwandlung. Erstelle zuerst eine im Facecam Studio — fremde Facecams nutze ich nicht. Kein Job wurde gestartet.',
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Facecam Studio öffnen', path: NEXTER_STUDIO_PATHS.facecam }],
        });
        await persistSession(session);
        return session;
      }
    }
    if (quoteKind === 'overlay') {
      const settings = parseOverlayIntent(message, {
        dnaName: ctx.dnaName,
        lastLogoId: ctx.lastLogoId,
        lastFacecamId: ctx.lastFacecamId,
        lastOverlayId: ctx.lastOverlayId,
        preferredPlatform: ctx.preferredPlatforms?.[0],
      });
      if (settings.convertFromExisting && !ctx.lastOverlayId) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content:
            'Ich finde kein eigenes Ausgangs-Overlay für die Plattform-Umwandlung. Erstelle zuerst eines im Overlay Studio — fremde Overlays nutze ich nicht. Kein Job wurde gestartet.',
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Overlay Studio öffnen', path: NEXTER_STUDIO_PATHS.overlay }],
        });
        await persistSession(session);
        return session;
      }
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
        await persistSession(session);
        return session;
      }
      if (intent.wantLastLogo && !ctx.lastLogoId) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content:
            'Ich finde kein eigenes Logo. Erstelle zuerst eines im Logo Studio — fremde Assets nutze ich nicht. Kein Textjob wurde gestartet.',
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Logo Studio öffnen', path: NEXTER_STUDIO_PATHS.logo }],
        });
        await persistSession(session);
        return session;
      }
      if ((intent.revisionField || intent.variantCount) && !ctx.contentPackageId && !intent.wantLastShort && !intent.wantLastLogo) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content:
            'Dafür brauche ich ein bestehendes Content-Paket. Erstelle zuerst Titel/Caption/Hashtags — ich starte keinen neuen Zufallstext. Kein Job, keine Coins.',
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Text Studio öffnen', path: NEXTER_STUDIO_PATHS.text }],
        });
        await persistSession(session);
        return session;
      }
    }
    if (quoteKind === 'captions') {
      const videoProjectId = ctx.videoProjectId;
      if (!videoProjectId) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content:
            'Automatische Untertitel brauchen ein eigenes Video. Lade zuerst eines hoch. Ich starte keine Transkription und buche nichts ab.',
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Video Studio öffnen', path: NEXTER_STUDIO_PATHS.video }],
        });
        await persistSession(session);
        return session;
      }
    }
    if (quoteKind === 'music') {
      const settings = parseMusicIntent(message, {
        styleDirection: ctx.styleDirection,
        dnaName: ctx.dnaName,
      });
      const maxSec = musicGenMaxDurationSec();
      const requestedDuration = settings.duration ?? maxSec;
      const durationCheck = checkMusicDuration(requestedDuration, maxSec);
      if (!durationCheck.ok) {
        session.messages.push({
          id: randomUUID(),
          role: 'assistant',
          content: `${durationCheck.message} MusicGen unterstützt maximal ${maxSec} Sekunden. Kein Job, keine Coins.`,
          createdAt: new Date().toISOString(),
          actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Musik Studio öffnen', path: NEXTER_STUDIO_PATHS.music }],
        });
        await persistSession(session);
        return session;
      }
    }
    if (quoteKind === 'mockup') {
      const parsed = parseMockupIntent(message, {
        lastLogoId: ctx.lastLogoId,
        lastStickerId: ctx.lastStickerId,
        lastBannerId: ctx.lastBannerId,
        lastMockupId: ctx.lastMockupId,
        dnaName: ctx.dnaName,
      });
      if (!parsed.lifestyle) {
        try {
          const job = await generateCompositeMockup(userId, {
            category: parsed.category,
            colorId: parsed.colorId,
            modelLabel: parsed.category === 'hoodie' ? 'Pullover' : parsed.category === 'tshirt' ? 'Unisex Classic' : 'Classic 11oz',
            placement: parsed.placement ?? 'front',
            scalePercent: parsed.scalePercent ?? 100,
            sourceLogoJobId: parsed.sourceLogoJobId,
            sourceStickerJobId: parsed.sourceStickerJobId,
            projectId: meta?.projectId || ctx.projectId,
          });
          session.messages.push({
            id: randomUUID(),
            role: 'assistant',
            content: `Lokales Composite ist fertig. ${job.config?.summary ?? parsed.summary ?? ''} Keine Coins, kein KI-Provider.`,
            createdAt: new Date().toISOString(),
            actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Mockup Studio öffnen', path: NEXTER_STUDIO_PATHS.mockup }],
          });
          await persistSession(session);
          return session;
        } catch (err) {
          const code = err instanceof ServiceError ? err.code : '';
          session.messages.push({
            id: randomUUID(),
            role: 'assistant',
            content:
              code === 'NO_DESIGN' || code === 'SOURCE_MISSING'
                ? 'Welches eigene Logo oder welchen Sticker soll ich verwenden? Fremde Dateien nutze ich nicht.'
                : err instanceof Error
                  ? err.message
                  : 'Mockup fehlgeschlagen.',
            createdAt: new Date().toISOString(),
            actions: [{ id: randomUUID(), tool: 'open_studio', label: 'Mockup Studio öffnen', path: NEXTER_STUDIO_PATHS.mockup }],
          });
          await persistSession(session);
          return session;
        }
      }
    }
    const quotePayload =
      quoteKind === 'mockup'
        ? {
            ...parseMockupIntent(message, {
              lastLogoId: ctx.lastLogoId,
              lastStickerId: ctx.lastStickerId,
              lastBannerId: ctx.lastBannerId,
              lastMockupId: ctx.lastMockupId,
            }),
            lifestyle: true,
          }
        : quoteKind === 'animation'
          ? { ...parseAnimationIntent(message), message }
          : quoteKind === 'music'
            ? (() => {
                const settings = parseMusicIntent(message, {
                  styleDirection: ctx.styleDirection,
                  dnaName: ctx.dnaName,
                });
                const duration = settings.duration ?? musicGenMaxDurationSec();
                return {
                  ...settings,
                  duration,
                  message,
                };
              })()
          : quoteKind === 'voice'
            ? (() => {
                const settings = parseVoiceIntent(message, {
                  language: ctx.language,
                });
                return {
                  text: settings.text,
                  language: settings.language,
                  voiceCatalogId: settings.voiceCatalogId,
                  title: settings.title,
                  settings: settings.settings,
                  message,
                };
              })()
          : quoteKind === 'logo'
            ? (() => {
                const settings = parseLogoIntent(message, {
                  dnaName: ctx.dnaName,
                  primaryColors: ctx.primaryColors,
                  styleDirection: ctx.styleDirection,
                  mascot: ctx.mascot,
                  addressAs: ctx.addressAs,
                });
                return {
                  ...settings.config,
                  logoName: settings.config.name || ctx.dnaName || ctx.addressAs || '',
                  message,
                };
              })()
          : quoteKind === 'banner'
            ? (() => {
                const settings = parseBannerIntent(message, {
                  dnaName: ctx.dnaName,
                  primaryColors: ctx.primaryColors,
                  styleDirection: ctx.styleDirection,
                  mascot: ctx.mascot,
                  lastLogoId: ctx.lastLogoId,
                  lastBannerId: ctx.lastBannerId,
                  preferredPlatform: ctx.preferredPlatforms?.[0],
                });
                return {
                  ...settings.config,
                  title: settings.config.title || ctx.dnaName || '',
                  platform: settings.config.platform,
                  sourceLogoJobId: settings.config.logoJobId,
                  parentJobId: settings.convertFromExisting ? ctx.lastBannerId : undefined,
                  convertToPlatform: settings.convertToPlatform,
                  message,
                };
              })()
          : quoteKind === 'facecam'
            ? (() => {
                const settings = parseFacecamIntent(message, {
                  dnaName: ctx.dnaName,
                  primaryColors: ctx.primaryColors,
                  styleDirection: ctx.styleDirection,
                  mascot: ctx.mascot,
                  lastLogoId: ctx.lastLogoId,
                  lastFacecamId: ctx.lastFacecamId,
                  preferredPlatform: ctx.preferredPlatforms?.[0],
                });
                return {
                  ...settings.config,
                  platform: settings.config.platform,
                  sourceLogoJobId: settings.config.logoJobId,
                  logoAssetId: settings.config.logoJobId,
                  parentJobId: settings.convertFromExisting ? ctx.lastFacecamId : undefined,
                  convertToPlatform: settings.convertToPlatform,
                  outputFormat: settings.config.format,
                  message,
                };
              })()
          : quoteKind === 'overlay'
            ? (() => {
                const settings = parseOverlayIntent(message, {
                  dnaName: ctx.dnaName,
                  primaryColors: ctx.primaryColors,
                  styleDirection: ctx.styleDirection,
                  mascot: ctx.mascot,
                  lastLogoId: ctx.lastLogoId,
                  lastFacecamId: ctx.lastFacecamId,
                  lastOverlayId: ctx.lastOverlayId,
                  preferredPlatform: ctx.preferredPlatforms?.[0],
                });
                return {
                  ...settings.config,
                  platform: settings.config.platform,
                  sourceLogoJobId: settings.config.logoJobId,
                  sourceFacecamJobId: settings.config.facecamJobId,
                  parentJobId: settings.convertFromExisting ? ctx.lastOverlayId : undefined,
                  convertToPlatform: settings.convertToPlatform,
                  outputFormat: settings.config.format,
                  message,
                };
              })()
          : quoteKind === 'sticker'
            ? (() => {
                const settings = parseStickerIntent(message, {
                  dnaName: ctx.dnaName,
                  primaryColors: ctx.primaryColors,
                  styleDirection: ctx.styleDirection,
                  mascot: ctx.mascot,
                  lastLogoId: ctx.lastLogoId,
                  lastStickerId: ctx.lastStickerId,
                  preferredPlatform: ctx.preferredPlatforms?.[0],
                });
                return {
                  ...settings.config,
                  platform: settings.config.platform,
                  kind: settings.config.kind,
                  sourceLogoJobId: settings.config.logoJobId,
                  outputFormat: settings.config.format,
                  requestedCount: 1,
                  message,
                };
              })()
          : quoteKind === 'text'
            ? (() => {
                const intent = parseSocialIntent(message, {
                  dnaName: ctx.dnaName,
                  lastShortId: ctx.lastShortId,
                  lastLogoId: ctx.lastLogoId,
                  preferredPlatforms: ctx.preferredPlatforms,
                  language: ctx.language,
                });
                const useExisting =
                  Boolean(intent.revisionField || intent.variantCount || /daraus|variante/.test(message.toLowerCase())) &&
                  Boolean(ctx.contentPackageId);
                return {
                  kind: intent.kind,
                  topic: ctx.dnaName && !intent.wantLastShort && !intent.wantLastLogo ? `${ctx.dnaName}: ${message}` : message,
                  projectId: meta?.projectId || ctx.projectId,
                  sourceType: intent.wantLastLogo ? 'logo' : intent.wantLastShort ? 'short' : ctx.contentPackageId && intent.revisionField ? undefined : 'topic',
                  sourceAssetId: intent.wantLastLogo ? ctx.lastLogoId : intent.wantLastShort ? ctx.lastShortId : undefined,
                  videoProjectId: intent.wantLastShort ? ctx.lastShortVideoProjectId : undefined,
                  wantLastShort: intent.wantLastShort,
                  wantLastLogo: intent.wantLastLogo,
                  packageId: useExisting ? ctx.contentPackageId : undefined,
                  revisionField: intent.revisionField,
                  revisionInstruction: intent.revisionInstruction || message,
                  variantCount: intent.variantCount,
                  platforms: intent.platform ? [intent.platform] : undefined,
                  tone: intent.tone,
                  language: ctx.language,
                  summary: intent.summary,
                };
              })()
          : quoteKind === 'captions'
            ? { videoProjectId: ctx.videoProjectId, reviewRequired: true }
            : quoteKind === 'streamset'
              ? {
                  selectedKeys: defaultStreamsetQuoteKeys(message, ctx.preferredPlatforms?.[0]),
                }
            : undefined;
    const quote = await createQuote(userId, quoteKind, meta?.projectId, quotePayload);
    quoteId = quote.id;
    quoteExpiresAt = quote.expiresAt;
    quoteCost = quote.coinCost;
  }

  const memory = await listMemory(userId);
  const { suggestions, actions } = buildActions(
    message,
    ctx,
    quoteId,
    quoteKind,
    isChangeQuote,
    {
      expiresAt: quoteExpiresAt,
      coinBalance: ctx.coinBalance,
      coinCost: quoteCost ?? undefined,
    },
    conversationIntent.intent
  );
  const warning = warnBadSettings(message);
  const format =
    intentAllowsFormatFallback(conversationIntent.intent) || /tiktok|shorts|reel|twitch|youtube|instagram|discord/i.test(message)
      ? recommendFormat(message, ctx)
      : null;
  const dnaScope = detectDnaChangeScope(message);
  const dnaConfirm =
    dnaScope && !ctx.locks?.colors && !ctx.locks?.style
      ? dnaUpdateConfirmationPrompt(message)
      : null;
  const continuity =
    quoteKind && quoteKind !== 'logo' && quoteKind !== 'banner' && quoteKind !== 'facecam' && quoteKind !== 'overlay' && quoteKind !== 'sticker' && quoteKind !== 'mockup' && quoteKind !== 'text' && quoteKind !== 'music' && quoteKind !== 'voice' && quoteKind !== 'captions'
      ? describeDnaContinuity(ctx, followOnAssetLabel(quoteKind))
      : (quoteKind === 'logo' || quoteKind === 'banner' || quoteKind === 'facecam' || quoteKind === 'overlay' || quoteKind === 'sticker' || quoteKind === 'mockup') && ctx.hasDna
        ? describeDnaContinuity(
            ctx,
            quoteKind === 'banner'
              ? 'ein Banner'
              : quoteKind === 'facecam'
                ? 'eine Facecam'
                : quoteKind === 'overlay'
                  ? 'ein Overlay'
                  : quoteKind === 'sticker'
                    ? 'einen Sticker'
                    : quoteKind === 'mockup'
                      ? 'ein Mockup'
                      : 'ein Logo'
          )
        : null;
  const musicBrief =
    quoteKind === 'music'
      ? (() => {
          const s = parseMusicIntent(message, { styleDirection: ctx.styleDirection, dnaName: ctx.dnaName });
          const duration = s.duration ?? musicGenMaxDurationSec();
          return `${s.summary ?? ''}`.trim() || `${duration}s instrumental`;
        })()
      : quoteKind === 'voice'
        ? (() => {
            const s = parseVoiceIntent(message, { language: ctx.language });
            return `${s.text.length} Zeichen · ${s.language} · ${s.voiceCatalogId || 'nexter-default'}`;
          })()
        : quoteKind === 'logo'
          ? (() => {
              const s = parseLogoIntent(message, {
                dnaName: ctx.dnaName,
                primaryColors: ctx.primaryColors,
                styleDirection: ctx.styleDirection,
                mascot: ctx.mascot,
                addressAs: ctx.addressAs,
              });
              return s.config.summary;
            })()
        : quoteKind === 'banner'
          ? (() => {
              const s = parseBannerIntent(message, {
                dnaName: ctx.dnaName,
                primaryColors: ctx.primaryColors,
                styleDirection: ctx.styleDirection,
                mascot: ctx.mascot,
                lastLogoId: ctx.lastLogoId,
                lastBannerId: ctx.lastBannerId,
                preferredPlatform: ctx.preferredPlatforms?.[0],
              });
              return s.config.summary;
            })()
        : quoteKind === 'facecam'
          ? (() => {
              const s = parseFacecamIntent(message, {
                dnaName: ctx.dnaName,
                primaryColors: ctx.primaryColors,
                styleDirection: ctx.styleDirection,
                mascot: ctx.mascot,
                lastLogoId: ctx.lastLogoId,
                lastFacecamId: ctx.lastFacecamId,
                preferredPlatform: ctx.preferredPlatforms?.[0],
              });
              return s.config.summary;
            })()
        : quoteKind === 'overlay'
          ? (() => {
              const s = parseOverlayIntent(message, {
                dnaName: ctx.dnaName,
                primaryColors: ctx.primaryColors,
                styleDirection: ctx.styleDirection,
                mascot: ctx.mascot,
                lastLogoId: ctx.lastLogoId,
                lastFacecamId: ctx.lastFacecamId,
                lastOverlayId: ctx.lastOverlayId,
                preferredPlatform: ctx.preferredPlatforms?.[0],
              });
              return s.config.summary;
            })()
        : quoteKind === 'sticker'
          ? (() => {
              const s = parseStickerIntent(message, {
                dnaName: ctx.dnaName,
                primaryColors: ctx.primaryColors,
                styleDirection: ctx.styleDirection,
                mascot: ctx.mascot,
                lastLogoId: ctx.lastLogoId,
                lastStickerId: ctx.lastStickerId,
                preferredPlatform: ctx.preferredPlatforms?.[0],
              });
              return s.config.summary;
            })()
          : quoteKind === 'mockup'
            ? parseMockupIntent(message, {
                lastLogoId: ctx.lastLogoId,
                lastStickerId: ctx.lastStickerId,
                lastBannerId: ctx.lastBannerId,
                lastMockupId: ctx.lastMockupId,
                dnaName: ctx.dnaName,
              }).summary
            : quoteKind === 'text'
              ? parseSocialIntent(message, {
                  dnaName: ctx.dnaName,
                  lastShortId: ctx.lastShortId,
                  lastLogoId: ctx.lastLogoId,
                  preferredPlatforms: ctx.preferredPlatforms,
                  language: ctx.language,
                }).summary
            : null;

  let reply = await generateNexterReply({
    userId,
    messages: session.messages,
    ctx,
    memory: memoryAsPrompt(memory),
    path: meta?.path,
    hint: meta?.hint,
    warning,
    format,
    quoteKind,
    quotedCost: quoteCost ?? (quoteId && quoteKind ? coinCostForKind(quoteKind) : null),
    musicBrief,
    continuity,
    dnaConfirm,
    intent: conversationIntent.intent,
  });
  if (quoteCost != null && intentAllowsQuote(conversationIntent.intent)) {
    reply = `${insufficientCoinsPrefix(ctx.coinBalance, quoteCost)}${reply}`;
  }

  session.messages.push({
    id: randomUUID(),
    role: 'assistant',
    content: reply,
    createdAt: new Date().toISOString(),
    suggestions,
    actions,
  });
  await persistSession(session);
  return session;
}

async function generateNexterReply(input: {
  userId: string;
  messages: NexterChatMessage[];
  ctx: Awaited<ReturnType<typeof buildNexterContext>>;
  memory: string;
  path?: string;
  hint?: string;
  warning: string | null;
  format: string | null;
  quoteKind?: NexterQuoteKind;
  quotedCost?: number | null;
  musicBrief?: string | null;
  continuity?: string | null;
  dnaConfirm?: string | null;
  intent?: NexterConversationIntent;
}): Promise<string> {
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const replyLanguage = detectEphemeralLanguage(lastUser) ?? input.ctx.language ?? 'de';
  const intent = input.intent ?? 'AMBIGUOUS';
  const includeExactColorCodes = messageAsksExactColorCode(lastUser);
  const contextBlock =
    intent === 'SMALLTALK' || intent === 'APP_HELP' || intent === 'ACCOUNT_OR_SETTINGS' || intent === 'NAVIGATION_ACTION'
      ? formatContextForPrompt(input.ctx, { minimal: true })
      : intent === 'CREATOR_ADVICE'
        ? formatContextForPrompt(input.ctx, {
            includeGaps: false,
            includeInventory: false,
            includeProjects: false,
            includeDna: true,
            includeExactColorCodes,
          })
        : intent === 'PROJECT_ANALYSIS'
          ? formatContextForPrompt(input.ctx, {
              includeGaps: true,
              includeInventory: true,
              includeDna: true,
              includeProjects: true,
              includeExactColorCodes,
            })
          : formatContextForPrompt(input.ctx, {
              includeGaps: false,
              includeInventory: intent === 'CREATE_ASSET' || intent === 'MODIFY_ASSET',
              includeDna: true,
              includeProjects: intent === 'CREATE_ASSET' || intent === 'MODIFY_ASSET',
              includeExactColorCodes,
            });
  const system = buildNexterSystemPrompt({
    intent,
    replyLanguageInstruction: nexterReplyLanguageInstruction(replyLanguage),
    addressAs: input.ctx.addressAs,
    contextBlock,
    memory: intent === 'SMALLTALK' ? '' : input.memory,
    path: input.path,
    hint: input.hint,
    continuity: input.continuity,
    dnaConfirm: input.dnaConfirm,
    warning: input.warning,
    format: input.format,
    musicBrief: intent === 'NAVIGATION_ACTION' || intent === 'SMALLTALK' ? null : input.musicBrief,
    quoteKind:
      intent === 'NAVIGATION_ACTION' || intent === 'SMALLTALK' || intent === 'PROJECT_ANALYSIS'
        ? null
        : input.quoteKind,
    quotedCost:
      intent === 'NAVIGATION_ACTION' || intent === 'SMALLTALK' || intent === 'PROJECT_ANALYSIS'
        ? null
        : input.quotedCost,
  });

  if (shouldCallLiveNexterChatProvider()) {
    const slot = await consumeNexterChatProviderSlot(input.userId);
    if (!slot.ok) {
      throw new ServiceError(
        429,
        'NEXTER_CHAT_LIMIT',
        'Nexter-Chat-Limit erreicht. Bitte später erneut versuchen.'
      );
    }
    if (liveNexterChatInFlight.has(input.userId)) {
      throw new ServiceError(
        429,
        'NEXTER_CHAT_LIMIT',
        'Nexter-Chat läuft bereits. Bitte warten.'
      );
    }
    liveNexterChatInFlight.add(input.userId);
    try {
      const history = input.messages.slice(-NEXTER_CHAT_PROVIDER_HISTORY).map((m) => ({
        role: m.role === 'system' ? 'system' : m.role,
        content: m.content,
      }));
      const content = await fetchNexterChatCompletion(system, history);
      const spoken = intent === 'SMALLTALK' ? stripUnsolicitedCreatorCta(content) : content;
      const extras = [
        input.warning,
        intent === 'SMALLTALK' || intent === 'APP_HELP' || intent === 'AMBIGUOUS' ? null : input.format,
      ].filter(Boolean);
      return extras.length ? `${spoken}\n\n${extras.join('\n')}` : spoken;
    } finally {
      liveNexterChatInFlight.delete(input.userId);
    }
  }

  if (isProduction()) {
    throw new ServiceError(503, 'AI_UNAVAILABLE', 'AI PROVIDER NOT CONFIGURED');
  }

  if (isDevMode()) {
    return devReply(input);
  }

  throw new ServiceError(503, 'AI_UNAVAILABLE', 'Nexter ist nicht verfügbar.');
}

function smalltalkDevReply(last: string): string {
  const t = last.trim().toLowerCase();
  if (/witz|joke/.test(t)) {
    return 'Klar: Warum hat das Overlay keine Freunde? Weil es immer im Vordergrund steht. 😄';
  }
  if (/guten morgen|good morning/.test(t)) return 'Guten Morgen! Schön, dass du da bist.';
  if (/danke,? reicht|reicht erstmal|passt erstmal/.test(t)) {
    return 'Alles klar, wir pausieren hier. Melde dich, wenn du weitermachen willst.';
  }
  if (/danke/.test(t) || /^thanks\b/.test(t)) return 'Gern geschehen.';
  if (/was machst du/.test(t)) return 'Ich unterhalte mich gerade mit dir. Wie läuft’s bei dir?';
  if (/wie war dein tag|how was your day/.test(t)) return 'Ganz ruhig — und deiner?';
  if (/sieht (richtig |echt |voll )?(gut|super|toll) aus|gefällt mir/.test(t)) {
    return 'Freut mich!';
  }
  return 'Mir geht es gut, danke der Nachfrage! Und wie geht es dir?';
}

function devReply(input: {
  ctx: Awaited<ReturnType<typeof buildNexterContext>>;
  warning: string | null;
  format: string | null;
  messages: NexterChatMessage[];
  quoteKind?: NexterQuoteKind;
  quotedCost?: number | null;
  musicBrief?: string | null;
  continuity?: string | null;
  dnaConfirm?: string | null;
  intent?: NexterConversationIntent;
}): string {
  const last = input.messages[input.messages.length - 1]?.content ?? '';
  const intent = input.intent;
  const parts: string[] = [];
  if (intent === 'SMALLTALK') {
    return smalltalkDevReply(last);
  }
  if (intent === 'APP_HELP') {
    return 'Ich bin Nexter, dein KI-Assistent im Creator Studio. Ich helfe bei Branding, Streamsets, Logos und Studios. Keine Generation und keine Coins ohne deine Bestätigung.';
  }
  if (intent === 'ACCOUNT_OR_SETTINGS') {
    return 'Nexter-Farben und Theme änderst du in den Einstellungen. Dafür braucht es keine Generation und keine Coins.';
  }
  if (intent === 'MODIFY_ASSET' && !input.quoteKind) {
    return 'Welches Element möchtest du ändern — Logo, Banner, Facecam oder Overlay?';
  }
  if (intent === 'AMBIGUOUS' && !input.quoteKind && !input.dnaConfirm) {
    return 'Womit soll ich anfangen – Logo, Streamset, Banner, Intro oder etwas anderes?';
  }
  if (intent === 'CREATOR_ADVICE') {
    const colors =
      formatColorsForNexter(input.ctx.primaryColors, { includeHex: messageAsksExactColorCode(last) }) || 'noch offen';
    parts.push(
      input.ctx.hasDna
        ? `Zu deinem Look: DNA „${input.ctx.dnaName}“, Stil ${input.ctx.styleDirection ?? 'offen'}, Farben ${colors}.`
        : 'Ohne Creator DNA kann ich Farben nur allgemein empfehlen.'
    );
  } else if (intent === 'PROJECT_ANALYSIS' || detectAnalyzeIntent(last)) {
    const colors =
      formatColorsForNexter(input.ctx.primaryColors, { includeHex: messageAsksExactColorCode(last) }) ||
      'ohne Primärfarbe';
    parts.push(
      input.ctx.hasDna
        ? `Zu deinem Creator-Projekt: DNA „${input.ctx.dnaName}“ v${input.ctx.dnaVersion ?? '?'} (${input.ctx.styleDirection ?? 'Stil offen'}), Farben ${colors}${input.ctx.mascot ? `, Figur ${input.ctx.mascot}` : ''}${input.ctx.dnaSource === 'project' ? ' — Projekt-DNA' : input.ctx.dnaSource === 'active' ? ' — aktive User-DNA' : ''}.`
        : 'Ich sehe noch keine Creator DNA. Ohne DNA kann ich kein konsistentes Branding vorbereiten.'
    );
    if (input.ctx.projectName && input.ctx.projectId) parts.push(`Aktives Projekt: ${input.ctx.projectName}.`);
    if (!input.ctx.projectId) {
      parts.push('Du hast aktuell noch kein vollständiges Streamset-Projekt.');
    }
    if (input.ctx.assetInventory?.length) {
      parts.push(`Vorhanden: ${input.ctx.assetInventory.join(', ')}.`);
    } else if (input.ctx.projectId) {
      parts.push('In diesem Projekt sind noch keine aggregierten Assets hinterlegt.');
    }
    if (intent === 'PROJECT_ANALYSIS') {
      const present = (input.ctx.presentAssets ?? []).filter(Boolean);
      if (present.length) {
        parts.push(`Bereits erstellt: ${present.join(', ')}.`);
      }
      if (input.ctx.missingAssets.length) {
        parts.push(
          input.ctx.projectId
            ? `Im aktuellen Projekt fehlen gegenüber einem Komplettset noch: ${input.ctx.missingAssets.join(', ')}.`
            : `Auf Basis deiner vorhandenen Assets fehlen gegenüber einem Komplettset noch: ${input.ctx.missingAssets.join(', ')}.`
        );
      }
    }
    if (input.ctx.locks?.colors) parts.push('Farben sind gesperrt.');
    if (input.ctx.locks?.character || input.ctx.locks?.mascot) parts.push('Figur ist gesperrt.');
    if (input.ctx.locks?.style) parts.push('Stil ist gesperrt.');
    parts.push(`Coins: ${input.ctx.coinBalance}.`);
  } else if (input.quoteKind && input.quotedCost != null) {
    if (input.continuity) parts.push(input.continuity);
    parts.push(
      `Ich kann daraus ${input.quoteKind === 'streamset' ? (input.quotedCost === STREAMSET_THREE_PART_COIN_COST ? 'ein Streamset – 3 Teile' : input.quotedCost === STREAMSET_PACK_COIN_COST ? 'ein Komplettset' : 'ein Streamset') : input.quoteKind === 'mockup' ? 'ein Lifestyle-Mockup' : input.quoteKind === 'animation' ? 'eine Animation (Intro/Outro/Loop/Stinger)' : input.quoteKind === 'music' ? 'einen Musik-Track' : input.quoteKind === 'voice' ? 'ein Voiceover' : input.quoteKind === 'text' ? 'ein Content-Paket (Hook, Titel, Caption, Hashtags, CTA)' : input.quoteKind === 'captions' ? 'automatische Untertitel (danach zur Prüfung, nichts wird blind eingebrannt)' : `ein ${input.quoteKind}`} erstellen. Kosten: ${input.quotedCost} Coins. ${input.musicBrief ? `${input.musicBrief} ` : ''}${/änder|dunkler|aggressiv|variante|facecam|kleiner|transparent/i.test(last) ? 'Das ist eine KI-Variante auf Basis des bestehenden Designs, keine Pixel-genaue Layer-Bearbeitung. ' : ''}Es startet erst, wenn du auf Erstellen klickst.`
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
  if (input.dnaConfirm) parts.push(input.dnaConfirm);
  if (input.warning) parts.push(input.warning);
  if (input.format && intent !== 'AMBIGUOUS') {
    parts.push(input.format);
  }
  return parts.join(' ');
}
