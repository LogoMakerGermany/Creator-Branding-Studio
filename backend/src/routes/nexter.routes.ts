import { Router } from 'express';
import { z } from 'zod';
import { CoinSpendCategory, COIN_COSTS, Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceError } from '../lib/errors.js';
import { withCoinCharge } from '../lib/billable-job.js';
import { generateSpeech } from '../lib/media-providers.js';
import {
  getOrCreateNexterSession,
  getNexterSessionForUser,
  createNexterSession,
  nexterChat,
  clearNexterSession,
  appendAssistantMessage,
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
    throw new AppError(err.statusCode, err.code, err.message);
  }
  throw new AppError(400, 'NEXTER_ERROR', err instanceof Error ? err.message : 'Nexter-Fehler');
}

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
      })
      .parse(req.body);
    try {
      const session = await nexterChat(req.user!.uid, body.message, {
        path: body.path,
        hint: body.hint,
        projectId: body.projectId,
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
      const streamsetAsk = 'Soll ich dir daraus ein vollständiges Streamset erstellen?';
      const session = await appendAssistantMessage(
        req.user!.uid,
        result.quote.kind === 'logo'
          ? `${doneMsg} ${streamsetAsk} Das Paket kostet ${COIN_COSTS[CoinSpendCategory.STREAMSET_PACK]} Coins und startet erst, wenn du auf Erstellen klickst.`
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
                    : result.quote.kind === 'text'
                      ? ['Öffne das Text Studio', 'Mach die Caption kürzer']
                      : ['Öffne das Logo Studio', 'Was fehlt noch?'],
        }
      );
      sendSuccess(res, { ...result, session });
    } catch (err) {
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
      const transcript = await transcribeNexterAudio(body.audioBase64, body.mimeType ?? 'audio/webm');
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
      const { job } = await withCoinCharge(
        req.user!.uid,
        CoinSpendCategory.NEXTER_VOICE,
        'Nexter Sprachausgabe',
        async () => {
          try {
            const result = await generateSpeech(body.text.slice(0, 500));
            return { status: 'completed' as const, ...result };
          } catch (err) {
            return {
              status: 'failed' as const,
              error: err instanceof Error ? err.message : 'Sprachausgabe fehlgeschlagen',
            };
          }
        }
      );
      if (job.status === 'failed' || !('audioUrl' in job) || !job.audioUrl) {
        throw new AppError(503, 'VOICE_FAILED', job.error || 'Sprachausgabe fehlgeschlagen');
      }
      sendSuccess(res, { audioUrl: job.audioUrl, provider: job.provider });
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
