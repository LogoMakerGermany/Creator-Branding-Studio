import { Router } from 'express';
import { z } from 'zod';
import { CoinSpendCategory, COIN_COSTS, Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceError } from '../lib/errors.js';
import { getUserById } from '../services/user.service.js';
import { listPublicNexterVoices, getOfficialVoicePreview } from '../services/nexter/voice-catalog.service.js';
import { speakNexterReply } from '../services/voice.service.js';
import {
  getOrCreateNexterSession,
  getNexterSessionForUser,
  createNexterSession,
  nexterChat,
  clearNexterSession,
  appendAssistantMessage,
  setNexterActiveProject,
  buildNexterContext,
  listMemory,
  transcribeNexterAudio,
  confirmQuote,
  cancelQuote,
} from '../services/nexter/index.js';

export const nexterRoutes = Router();
nexterRoutes.use(authenticate, requirePermission(Permission.USE_AI_ASSISTANT));

function mapErr(err: unknown): never {
  if (err instanceof AppError) throw err;
  if (err instanceof ServiceError) {
    throw new AppError(err.statusCode, err.code, err.message, err.details);
  }
  throw new AppError(400, 'NEXTER_ERROR', err instanceof Error ? err.message : 'Nexter-Fehler');
}

nexterRoutes.get(
  '/voices',
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    sendSuccess(res, { voices: await listPublicNexterVoices() });
  })
);

nexterRoutes.get(
  '/voices/:catalogId/preview',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const preview = await getOfficialVoicePreview(String(req.params.catalogId));
    if (!preview) throw new AppError(404, 'PREVIEW_UNAVAILABLE', 'Keine Vorschau für diese Stimme');
    res.setHeader('Content-Type', preview.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(preview.buffer);
  })
);

nexterRoutes.get(
  '/session',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { session: await getOrCreateNexterSession(req.user!.uid) });
  })
);

nexterRoutes.get(
  '/session/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const session = await getNexterSessionForUser(String(req.params.id), req.user!.uid);
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Unterhaltung nicht gefunden');
    sendSuccess(res, { session });
  })
);

nexterRoutes.post(
  '/session',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { session: await createNexterSession(req.user!.uid) });
  })
);

nexterRoutes.patch(
  '/session/active-project',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        projectId: z.string().max(80).nullable(),
      })
      .parse(req.body);
    try {
      const result = await setNexterActiveProject(req.user!.uid, body.projectId);
      sendSuccess(res, result);
    } catch (err) {
      mapErr(err);
    }
  })
);

nexterRoutes.get(
  '/context',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    sendSuccess(res, { context: await buildNexterContext(req.user!.uid, projectId) });
  })
);

nexterRoutes.get(
  '/memory',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { memory: await listMemory(req.user!.uid) });
  })
);

nexterRoutes.post(
  '/chat',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        message: z.string().min(1).max(4000),
        path: z.string().max(200).optional(),
        hint: z.string().max(200).optional(),
        projectId: z.string().max(80).optional(),
        fileId: z.string().max(80).optional(),
      })
      .parse(req.body);
    try {
      const session = await nexterChat(req.user!.uid, body.message, {
        path: body.path,
        hint: body.hint,
        projectId: body.projectId,
        fileId: body.fileId,
      });
      sendSuccess(res, { session });
    } catch (err) {
      mapErr(err);
    }
  })
);

nexterRoutes.post(
  '/quotes/:id/confirm',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const result = await confirmQuote(req.user!.uid, String(req.params.id));
      const doneMsg = result.jobIds.length
        ? `Erledigt. ${result.coinsSpent} Coins abgezogen, neuer Stand: ${result.newBalance}.`
        : 'Generierung abgeschlossen.';
      const streamsetAsk = 'Soll ich dir daraus ein Komplettset erstellen?';
      const session = await appendAssistantMessage(
        req.user!.uid,
        result.quote.kind === 'logo'
          ? `${doneMsg} ${streamsetAsk} Das Komplettset kostet ${COIN_COSTS[CoinSpendCategory.STREAMSET_PACK]} Coins und startet erst, wenn du auf Erstellen klickst.`
          : doneMsg,
        {
          suggestions:
            result.quote.kind === 'logo'
              ? [streamsetAsk, 'Was fehlt noch?']
              : result.quote.kind === 'streamset'
                ? ['Öffne das Streamset Studio', 'Was fehlt noch?']
                : result.quote.kind === 'mockup'
                  ? ['Öffne das Mockup Studio', 'Was fehlt noch?']
                    : result.quote.kind === 'animation'
                    ? ['Öffne das Animation Studio', 'Was fehlt noch?']
                    : result.quote.kind === 'ai-video'
                      ? ['Öffne das KI-Video Studio', 'Was fehlt noch?']
                    : result.quote.kind === 'text'
                      ? ['Öffne das Text Studio', 'Mach die Caption kürzer']
                      : result.quote.kind === 'music'
                        ? ['Öffne das Musik Studio', 'Was fehlt noch?']
                        : result.quote.kind === 'voice'
                          ? ['Öffne das Voice Studio', 'Was fehlt noch?']
                          : result.quote.kind === 'captions'
                          ? ['Captions prüfen', 'Öffne das Video Studio']
                        : ['Öffne das Logo Studio', 'Was fehlt noch?'],
        }
      );
      sendSuccess(res, { ...result, session });
    } catch (err) {
      if (
        err instanceof ServiceError &&
        (err.code === 'QUOTE_EXPIRED' ||
          err.code === 'PRICE_CHANGED' ||
          err.code === 'INSUFFICIENT_COINS' ||
          err.code === 'QUOTE_USED' ||
          err.code === 'QUOTE_NOT_FOUND' ||
          err.code === 'IMAGE_GENERATION_UNAVAILABLE' ||
          err.code === 'VIDEO_PROVIDER_UNAVAILABLE' ||
          err.code === 'MUSIC_PROVIDER_UNAVAILABLE' ||
          err.code === 'GENERATIONS_DISABLED' ||
          err.code === 'PROVIDER_UNAVAILABLE' ||
          err.code === 'PROVIDER_TIMEOUT' ||
          err.code === 'PROVIDER_ERROR' ||
          err.code === 'PROVIDER_INVALID_PAYLOAD' ||
          err.code === 'STORAGE_ERROR')
      ) {
        await appendAssistantMessage(req.user!.uid, err.message).catch(() => undefined);
      }
      mapErr(err);
    }
  })
);

nexterRoutes.post(
  '/quotes/:id/cancel',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const quote = await cancelQuote(req.user!.uid, String(req.params.id));
      const session = await appendAssistantMessage(req.user!.uid, 'Alles klar — nichts wurde gestartet, keine Coins abgezogen.');
      sendSuccess(res, { quote, session });
    } catch (err) {
      mapErr(err);
    }
  })
);

nexterRoutes.post(
  '/listen',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        audioBase64: z.string().min(8).max(6_000_000),
        mimeType: z.string().max(80).optional(),
      })
      .parse(req.body);
    try {
      const transcript = await transcribeNexterAudio(
        body.audioBase64,
        body.mimeType ?? 'audio/webm',
        (await getUserById(req.user!.uid))?.nexterPreferences?.language
      );
      sendSuccess(res, { transcript });
    } catch (err) {
      mapErr(err);
    }
  })
);

nexterRoutes.post(
  '/speak',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);
    try {
      const result = await speakNexterReply(req.user!.uid, body.text);
      sendSuccess(res, result);
    } catch (err) {
      mapErr(err);
    }
  })
);

nexterRoutes.delete(
  '/session',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await clearNexterSession(req.user!.uid);
    sendSuccess(res, { cleared: true });
  })
);
