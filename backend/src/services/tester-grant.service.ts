import { UserRole } from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';
import { getUserById } from './user.service.js';
import { addCoinsResult, getCoinBalance } from './coins.service.js';
import { writeAdminAudit } from './admin-audit.service.js';

export const TESTER_GRANT_AMOUNT = 500;

export function testerGrantIdempotencyKey(userId: string): string {
  return `tester-grant-500:${userId}`;
}

export async function grantTesterCoins(params: {
  actorUserId: string;
  targetUserId: string;
  reason: string;
  confirm: true;
}): Promise<{
  granted: number;
  duplicate: boolean;
  newBalance: number;
  alreadyGranted: boolean;
  message: string;
}> {
  if (params.confirm !== true) {
    throw new AppError(400, 'CONFIRMATION_REQUIRED', 'Tester-Grant erfordert Bestätigung');
  }
  const reason = params.reason.trim();
  if (reason.length < 3) {
    throw new AppError(400, 'INVALID_INPUT', 'Grund ist Pflicht');
  }

  const target = await getUserById(params.targetUserId);
  if (!target) throw new AppError(404, 'NOT_FOUND', 'Nutzer nicht gefunden');
  if (target.role !== UserRole.TESTER) {
    throw new AppError(403, 'TESTER_ROLE_REQUIRED', 'Gutschrift nur für Tester-Rolle');
  }

  const before = await getCoinBalance(target.id);
  const credit = await addCoinsResult(target.id, TESTER_GRANT_AMOUNT, 'Tester-Guthaben 500', 'bonus', {
    idempotencyKey: testerGrantIdempotencyKey(target.id),
    adminActorId: params.actorUserId,
    reason,
    sourceType: 'admin',
    sourceId: params.actorUserId,
  });
  if (!credit.success) {
    throw new AppError(500, 'CREDIT_FAILED', 'Tester-Gutschrift fehlgeschlagen');
  }
  const duplicate = credit.duplicate;
  const newBalance = credit.newBalance;

  await writeAdminAudit({
    actorUserId: params.actorUserId,
    action: 'tester_grant_500',
    targetUserId: target.id,
    reason,
    before: { coinBalance: before },
    after: { coinBalance: newBalance, granted: duplicate ? 0 : TESTER_GRANT_AMOUNT, duplicate },
  });

  return {
    granted: duplicate ? 0 : TESTER_GRANT_AMOUNT,
    duplicate,
    newBalance,
    alreadyGranted: duplicate,
    message: duplicate ? 'bereits vergeben' : 'Testguthaben vergeben',
  };
}
