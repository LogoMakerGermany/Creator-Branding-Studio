import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import { arePaymentsEnabled } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import {
  isSafeClientRequestId,
  publicHealthPayload,
  redactLogString,
  resolveRequestId,
  safeErrorDetails,
  sanitizeFfmpegError,
  sanitizeProviderError,
  shouldSkipRequestLog,
} from '../lib/observability.js';
import { AppError, errorHandler } from '../middleware/errorHandler.js';
import { requireRole } from '../middleware/rbac.js';
import { UserRole } from '@ucbs/shared';
import { getAdminSystemStatus, listAdminJobs, sanitizeAdminJob } from './admin.service.js';
import { refundBillableChargeOnce } from './billable-charge.service.js';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');
const repoRoot = join(dir, '../../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function mockRes() {
  const bag: { statusCode?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    status(code: number) {
      bag.statusCode = code;
      return res;
    },
    json(body: unknown) {
      bag.body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      bag.headers[name.toLowerCase()] = value;
    },
  };
  return { res: res as unknown as Response, bag };
}

describe('observability local closure', () => {
  it('public health is minimal and has no secrets', () => {
    const ok = publicHealthPayload(true);
    const down = publicHealthPayload(false);
    assert.deepEqual(ok, { status: 'ok' });
    assert.deepEqual(down, { status: 'not_ready' });
    assert.equal('firebase' in down, false);
    assert.equal(JSON.stringify(ok).includes('sk_live'), false);
    assert.match(src('src/index.ts'), /publicHealthPayload/);
    assert.doesNotMatch(src('src/index.ts'), /res\.status\(503\)\.json\(\{[\s\S]*firebase:/);
  });

  it('detailed status is admin-only; unauthenticated and normal users are blocked', () => {
    const routes = src('src/routes/admin.routes.ts');
    assert.match(routes, /adminRoutes.use\(authenticate, requireRole\(UserRole\.ADMIN, UserRole\.SUPER_ADMIN\)\)/);
    assert.match(routes, /'\/system'/);
    const mw = requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN);
    assert.throws(
      () => mw({ user: undefined } as never, {} as never, () => undefined),
      (err: unknown) => err instanceof AppError && err.statusCode === 401
    );
    assert.throws(
      () =>
        mw(
          { user: { uid: 'u', email: 'a@x', role: UserRole.USER, displayName: 'u', coinBalance: 0 } } as never,
          {} as never,
          () => undefined
        ),
      (err: unknown) => err instanceof AppError && err.statusCode === 403
    );
  });

  it('request IDs are server-generated or tightly validated; malformed client IDs are ignored', () => {
    assert.equal(isSafeClientRequestId('short'), false);
    assert.equal(isSafeClientRequestId('../../../etc/passwd'), false);
    assert.equal(isSafeClientRequestId('a'.repeat(80)), false);
    assert.equal(isSafeClientRequestId('${jndi:ldap://x}'), false);
    assert.equal(isSafeClientRequestId('req-abc_DEF-123456'), true);
    const generated = resolveRequestId('not ok!!');
    assert.equal(generated.includes('!'), false);
    assert.notEqual(generated, 'not ok!!');
    const kept = resolveRequestId('req-abc_DEF-123456');
    assert.equal(kept, 'req-abc_DEF-123456');
    assert.match(src('src/middleware/request-context.ts'), /x-request-id/);
    assert.match(src('src/lib/observability.ts'), /JSON\.stringify\(line\)/);
    assert.doesNotMatch(src('src/middleware/request-context.ts'), /req\.headers/);
    assert.doesNotMatch(src('src/middleware/request-context.ts'), /req\.body/);
    assert.equal(shouldSkipRequestLog('/health'), true);
  });

  it('API errors include requestId and never leak stack, paths, or secrets', () => {
    const { res, bag } = mockRes();
    const req = { requestId: 'req-test-12345678', method: 'GET', originalUrl: '/api/v1/x' } as Request;
    errorHandler(new Error('C:\\Users\\LogoM\\secret\\app.ts boom'), req, res, () => undefined);
    const body = bag.body as { success: boolean; error: { code: string; message: string; requestId?: string } };
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'Ein interner Fehler ist aufgetreten');
    assert.equal(body.error.requestId, 'req-test-12345678');
    const raw = JSON.stringify(body);
    assert.equal(raw.includes('C:\\Users'), false);
    assert.equal(raw.includes('secret\\app'), false);
    assert.equal(raw.includes('Error:'), false);
    const { res: res2, bag: bag2 } = mockRes();
    errorHandler(
      new AppError(400, 'VALIDATION_ERROR', 'Ungültige Anfrage', {
        stack: 'at Object.foo',
        password: 'hunter2',
        authorization: 'Bearer abc',
        hint: 'ok',
      }),
      req,
      res2,
      () => undefined
    );
    const body2 = bag2.body as { error: { details?: Record<string, unknown> } };
    assert.equal(body2.error.details?.stack, undefined);
    assert.equal(body2.error.details?.password, undefined);
    assert.equal(body2.error.details?.authorization, undefined);
    assert.equal(body2.error.details?.hint, 'ok');
    assert.equal(src('src/middleware/errorHandler.ts').includes('err.stack'), false);
  });

  it('redacts tokens, keys, emails, signed URLs, and action-code-like secrets from logs', () => {
    assert.equal(redactLogString('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb'), 'Bearer [redacted]');
    assert.match(redactLogString('user creator@example.com failed'), /\[email\]/);
    assert.equal(redactLogString('prefix sk_live suffix'), '[redacted]');
    assert.equal(redactLogString('whsec_abc'), '[redacted]');
    assert.equal(redactLogString('re_abcdefghijklmnopqrstuv'), '[redacted]');
    assert.equal(
      redactLogString('https://storage.googleapis.com/x?X-Goog-Signature=abc'),
      '[signed-url]'
    );
    assert.equal(sanitizeProviderError(new Error('prefix sk_live suffix')), '[redacted]');
    const ffmpeg = sanitizeFfmpegError('ffmpeg C:\\Users\\LogoM\\video.mp4 failed');
    assert.equal(ffmpeg.includes('C:\\Users'), false);
    const obs = src('src/lib/observability.ts');
    assert.doesNotMatch(obs, /console\.(log|info|debug)\(.*password/i);
    assert.doesNotMatch(src('src/middleware/request-context.ts'), /Authorization/);
    assert.doesNotMatch(src('src/index.ts'), /FIREBASE_PRIVATE_KEY|RESEND_API_KEY|STRIPE_SECRET|PAYPAL_CLIENT_SECRET/);
  });

  it('admin status is sanitized: firebase, firestore, storage, dev-store, email, payments, providers', async () => {
    const system = await getAdminSystemStatus();
    assert.ok(system.checkedAt);
    assert.equal(typeof system.processUptimeSec, 'number');
    assert.ok(system.firestore);
    assert.ok(system.storage);
    assert.equal(system.firestore.liveChecked, false);
    assert.equal(system.storage.liveChecked, false);
    assert.equal(system.devStore, true);
    assert.equal(system.payments.enabled, false);
    assert.equal(arePaymentsEnabled(), false);
    assert.ok(system.email);
    for (const status of Object.values(system.providers)) {
      assert.equal('configured' in status, true);
      assert.equal(status.liveChecked, false);
    }
    const dumped = JSON.stringify(system);
    assert.equal(dumped.includes('BEGIN PRIVATE KEY'), false);
    assert.equal(dumped.includes('sk_live'), false);
    assert.equal(dumped.includes('sk_test'), false);
    assert.equal('apiKey' in system.providers, false);
    assert.match(repo('frontend/src/pages/admin/AdminPage.tsx'), /Diagnose/);
    assert.doesNotMatch(repo('frontend/src/pages/admin/AdminPage.tsx'), /99\.9%|100% healthy|0 incidents/);
  });

  it('jobs are limited, sanitized, and expose parent/child plus refund flags without prompts or URLs', async () => {
    const leaked = sanitizeAdminJob({
      id: 'j1',
      userId: 'u1',
      module: 'streamset',
      status: 'failed',
      createdAt: 't',
      prompt: 'secret creator prompt',
      imageUrl: 'https://storage.googleapis.com/bucket/o/x?X-Goog-Signature=abc',
      error: 'PROVIDER_FAILED',
      assetKey: 'starting-soon',
      parentJobId: 'parent-1',
      batchId: 'batch-1',
      refunded: true,
    });
    assert.equal(leaked.errorCode, 'PROVIDER_FAILED');
    assert.equal(leaked.assetKey, 'starting-soon');
    assert.equal(leaked.parentJobId, 'parent-1');
    assert.equal(leaked.refunded, true);
    assert.equal('prompt' in leaked, false);
    assert.equal('imageUrl' in leaked, false);
    const urlErr = sanitizeAdminJob({
      id: 'j2',
      userId: 'u1',
      status: 'failed',
      createdAt: 't',
      error: 'https://storage.googleapis.com/secret',
    });
    assert.equal(urlErr.errorCode, 'REDACTED');
    const jobs = await listAdminJobs({ limit: 5 });
    assert.ok(jobs.length <= 5);
    assert.match(src('src/routes/admin.routes.ts'), /listAdminJobs/);
    assert.equal(src('src/services/admin.service.ts').includes('progressPercent'), false);
    assert.match(src('src/services/billable-charge.service.ts'), /refundBillableChargeOnce/);
    assert.equal(typeof refundBillableChargeOnce, 'function');
  });

  it('streamset, file-cloud, auth, ffmpeg and nexter diagnostics stay on existing stores', () => {
    assert.match(src('src/services/streamset.service.ts'), /parentJobId/);
    assert.match(src('src/services/streamset.service.ts'), /assetKey/);
    assert.match(src('src/services/streamset.service.ts'), /refundedCoins/);
    assert.match(src('src/services/file-cloud.service.ts'), /FILE_MISSING|not found|nicht gefunden/i);
    assert.match(src('src/middleware/auth.ts'), /AUTH_REQUIRED|INVALID_TOKEN|EMAIL_NOT_VERIFIED/);
    assert.doesNotMatch(src('src/middleware/auth.ts'), /console\.(log|info).*token/i);
    assert.match(src('src/lib/video-processing.ts'), /sanitizeFfmpegError/);
    assert.match(src('src/lib/video-processing.ts'), /stderr\.length < 4000/);
    assert.doesNotMatch(src('src/services/nexter/conversation.service.ts'), /console\.(log|info|debug)\(.*content/);
    assert.doesNotMatch(src('src/services/nexter/conversation.service.ts'), /console\.(log|info).*prompt/);
    assert.match(src('src/services/admin-audit.service.ts'), /admin_audit_logs/);
    assert.doesNotMatch(src('src/lib/observability.ts'), /admin_audit_logs/);
  });

  it('frontend maps safe API errors, distinguishes network failure, and hides Error Boundary stacks', () => {
    const api = repo('frontend/src/services/api.ts');
    const boundary = repo('frontend/src/components/ErrorBoundary.tsx');
    const main = repo('frontend/src/main.tsx');
    assert.match(api, /NETWORK_ERROR/);
    assert.match(api, /Server nicht erreichbar/);
    assert.match(api, /requestId/);
    assert.match(api, /INSUFFICIENT_COINS/);
    assert.match(api, /FILE_MISSING/);
    assert.match(main, /ErrorBoundary/);
    assert.match(boundary, /Neu laden/);
    assert.doesNotMatch(boundary, /error\.stack|componentStack/);
    assert.equal(boundary.includes("from 'firebase/firestore'"), false);
    assert.equal(api.includes("from 'firebase/firestore'"), false);
    assert.equal(api.includes("from 'firebase/storage'"), false);
  });

  it('no fake metrics store, no external monitors, tests stay provider-free', () => {
    assert.doesNotMatch(src('src/lib/observability.ts'), /prometheus|datadog|sentry|grafana/i);
    assert.doesNotMatch(repo('frontend/src/pages/admin/AdminPage.tsx'), /Log Viewer|uptime history/i);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    assert.match(src('src/services/email.service.ts'), /isPaidProviderTestBlocked/);
  });
});
