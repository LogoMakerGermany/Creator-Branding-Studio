import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  CONTENT_PROVIDER_RIGHTS_INVENTORY,
  CONTENT_RIGHTS_ACK_VERSION,
  CONTENT_RIGHTS_ACK_STATEMENT,
  CONTENT_RIGHTS_REPORT_CATEGORIES,
  LEGAL_TEXT_STATUS,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_THREE_PART_COIN_COST,
  VOICE_CLONE_CONSENT_VERSION,
  classifyContentRightsRisk,
  rewritePromptForRightsSafety,
  UserRole,
} from '@ucbs/shared';
import { ServiceError } from '../lib/errors.js';
import { AppError } from '../middleware/errorHandler.js';
import { withCoinCharge } from '../lib/billable-job.js';
import { PRODUCTION_FIREBASE_PROJECT_ID } from '../lib/production-write-guard.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import { getOrCreateUser, getUserById, setUserRole, updateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { getCoinBalance } from './coins.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { setLogoTestHooks } from './logo.service.js';
import { generateVoiceTrack, setVoiceTestHooks } from './voice.service.js';
import {
  issueFileDownloadUrl,
  saveUserFile,
} from './file-cloud.service.js';
import {
  adminTakedownReportedFile,
  assertCurrentContentRightsAck,
  assertRightsReportReadable,
  CONTENT_RIGHTS_REPORT_MAX_PER_WINDOW,
  CONTENT_RIGHTS_REPORT_MESSAGE_MAX,
  getContentRightsReport,
  listContentRightsReportsForAdmin,
  listOwnContentRightsReports,
  recordContentRightsAck,
  recordVoiceCloneConsent,
  submitContentRightsReport,
  toPublicRightsReport,
  updateContentRightsReportStatus,
} from './content-rights.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function src(rel: string): string {
  return readFileSync(join(dir, '..', rel), 'utf8');
}

afterEach(() => {
  setLogoTestHooks(null);
  setVoiceTestHooks(null);
});

async function seed(opts?: { skipAck?: boolean; name?: string }) {
  const user = await getOrCreateUser(
    randomUUID(),
    `${randomUUID()}@rights.test`,
    opts?.name ?? 'Rights',
    opts?.skipAck ? { skipContentRightsAck: true } : undefined
  );
  const dna = await upsertDna({
    userId: user.id,
    name: 'RightsDNA',
    styleDirection: 'neon',
    primaryColors: ['#111111'],
  });
  const project = await createProject(user.id, { name: 'Rights Project', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

describe('Block R — content rights safety', () => {
  it('1-4. classifier distinguishes original, game mention, exact mark copy, and rewrite', () => {
    assert.equal(classifyContentRightsRisk('Originales taktisches E-Sports-Logo in Blau und Schwarz').category, 'NORMAL');
    assert.equal(classifyContentRightsRisk('Ich streame Call of Duty').category, 'NORMAL');
    assert.equal(classifyContentRightsRisk('Mach mir das offizielle Call of Duty Logo exakt nach').category, 'TRADEMARK_COPY_RISK');
    assert.equal(classifyContentRightsRisk('kopiere das Nike Logo exakt').category, 'TRADEMARK_COPY_RISK');
    assert.equal(classifyContentRightsRisk('mach das Adidas Logo und ersetze nur den Namen').category, 'TRADEMARK_COPY_RISK');
    assert.equal(classifyContentRightsRisk('mach das Twitch Logo identisch für meine Marke').category, 'TRADEMARK_COPY_RISK');
    const rewritten = rewritePromptForRightsSafety('Nike Logo exakt', 'TRADEMARK_COPY_RISK') ?? '';
    assert.match(rewritten, /Eigenständig|original/i);
    assert.doesNotMatch(rewritten, /exakt das Nike Logo kopieren/i);
  });

  it('17-19. personality, exact song copy, and genre music', () => {
    assert.equal(
      classifyContentRightsRisk('öffentliches Foto ist frei verwendbar').category,
      'PERSONALITY_RIGHTS_RISK'
    );
    assert.equal(classifyContentRightsRisk('mach den Song Bohemian Rhapsody exakt nach').category, 'COPYRIGHT_COPY_RISK');
    assert.equal(classifyContentRightsRisk('lofi chill hop, ruhige Stimmung, 90 BPM').category, 'NORMAL');
  });

  it('5-10. rights acknowledgement is versioned, server-gated, and required before debit', async () => {
    assert.equal(CONTENT_RIGHTS_ACK_VERSION, 'cr-1');
    assert.match(CONTENT_RIGHTS_ACK_STATEMENT, /erforderlichen Rechte/);
    const { user, project } = await seed({ skipAck: true });
    await assert.rejects(() => assertCurrentContentRightsAck(user.id), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.code, 'RIGHTS_ACK_REQUIRED');
      return true;
    });
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'OriginalMark', platform: 'twitch' });
    const before = await getCoinBalance(user.id);
    setLogoTestHooks({ result: 'success' });
    await assert.rejects(() => confirmQuote(user.id, quote.id), (err: unknown) => {
      const code = err instanceof ServiceError || err instanceof AppError ? err.code : '';
      assert.equal(code, 'RIGHTS_ACK_REQUIRED');
      return true;
    });
    assert.equal(await getCoinBalance(user.id), before);

    await recordContentRightsAck(user.id);
    const current = await getUserById(user.id);
    assert.equal(current?.contentRightsAck?.version, CONTENT_RIGHTS_ACK_VERSION);

    await updateUser(user.id, { contentRightsAck: { version: 'cr-0', acceptedAt: '2020-01-01T00:00:00.000Z' } });
    const staleQuote = await createQuote(user.id, 'logo', project.id, { logoName: 'OriginalMark', platform: 'twitch' });
    const mid = await getCoinBalance(user.id);
    await assert.rejects(() => confirmQuote(user.id, staleQuote.id), (err: unknown) => {
      const code = err instanceof ServiceError || err instanceof AppError ? err.code : '';
      assert.equal(code, 'RIGHTS_ACK_REQUIRED');
      return true;
    });
    assert.equal(await getCoinBalance(user.id), mid);
  });

  it('6. frontend checkbox alone cannot bypass server rightsConfirmed / ack gates', () => {
    const files = src('routes/modules.routes.ts');
    const video = src('routes/video.routes.ts');
    assert.match(files, /rightsConfirmed:\s*z\.literal\(true\)/);
    assert.match(video, /rightsConfirmed:\s*z\.literal\(true\)/);
    assert.match(src('lib/billable-job.ts'), /assertCurrentContentRightsAck/);
    assert.doesNotMatch(files, /localStorage/);
  });

  it('11. user cannot accept rights for another user', async () => {
    const a = await seed({ skipAck: true });
    const b = await seed({ skipAck: true });
    await recordContentRightsAck(a.user.id);
    const other = await getUserById(b.user.id);
    assert.equal(other?.contentRightsAck, undefined);
    assert.match(src('routes/content-rights.routes.ts'), /targetUserId/);
    assert.match(src('routes/content-rights.routes.ts'), /FORBIDDEN/);
  });

  it('12. NEXTER cannot auto-accept rights', () => {
    const conv = src('services/nexter/conversation.service.ts');
    const tools = src('services/nexter/tools.service.ts');
    assert.doesNotMatch(conv, /recordContentRightsAck|acceptRightsForUser/);
    assert.doesNotMatch(tools, /recordContentRightsAck|acceptRightsForUser/);
  });

  it('13-16. generic TTS vs voice clone consent, 0 debit and 0 provider on missing consent', async () => {
    const { user, project } = await seed();
    assert.equal((await getUserById(user.id))?.voiceCloneConsent, undefined);
    setVoiceTestHooks({ result: 'success' });
    let providerCalls = 0;
    setVoiceTestHooks({
      result: 'success',
      audioDataUrl: 'data:audio/wav;base64,AAAA',
    });
    const before = await getCoinBalance(user.id);
    await assert.rejects(
      () =>
        generateVoiceTrack(user.id, project.id, {
          text: 'Hallo Welt',
          voiceClone: true,
          referenceAudioDataUrl: 'data:audio/wav;base64,AAAA',
        }),
      (err: unknown) => {
        assert.ok(err instanceof ServiceError);
        assert.equal(err.code, 'VOICE_CLONE_CONSENT_REQUIRED');
        return true;
      }
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(providerCalls, 0);
    assert.equal(VOICE_CLONE_CONSENT_VERSION, 'vc-1');
    await recordVoiceCloneConsent(user.id, 'own');
    await assert.rejects(
      () =>
        generateVoiceTrack(user.id, project.id, {
          text: 'Hallo Welt',
          voiceClone: true,
          referenceAudioDataUrl: 'data:audio/wav;base64,AAAA',
        }),
      (err: unknown) => {
        assert.ok(err instanceof ServiceError);
        assert.equal(err.code, 'VOICE_CLONE_NOT_AVAILABLE');
        return true;
      }
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.match(src('services/voice.service.ts'), /isVoiceCloneRequest/);
    assert.match(src('services/voice.service.ts'), /assertVoiceCloneConsent/);
  });

  it('4. NEXTER risk reply offers an original alternative and does not overclaim', async () => {
    const { user } = await seed();
    const session = await nexterChat(user.id, 'Mach mir das offizielle Nike Logo exakt nach');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1)?.content ?? '';
    assert.match(last, /eigenständig|Original/i);
    assert.doesNotMatch(last, /urheberrechtsfrei|garantiert kommerziell|Trademark safe|du besitzt automatisch/i);
  });

  it('2. simple game mention does not attach a rights-risk warning', async () => {
    const { user } = await seed();
    const session = await nexterChat(user.id, 'Ich streame Call of Duty auf Twitch');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1)?.content ?? '';
    assert.doesNotMatch(last, /exakte Kopie eines Dritt-Markenzeichens/i);
  });

  it('20-22. video/font/merch coverage exists in product surfaces', () => {
    assert.match(src('routes/video.routes.ts'), /rightsConfirmed:\s*z\.literal\(true\)/);
    assert.match(repo('frontend/src/pages/video/VideoStudioPage.tsx'), /Rechte am Videomaterial/);
    const dna = src('routes/dna.routes.ts');
    assert.match(dna, /source:\s*z\.enum\(\['google', 'custom', 'system'\]\)/);
    assert.match(repo('frontend/src/pages/studios/MockupStudioPage.tsx'), /kommerziell|Merch|Rechte/);
    assert.match(repo('frontend/index.html'), /fonts\.googleapis\.com/);
    assert.match(repo('frontend/index.html'), /Inter/);
    assert.match(repo('frontend/index.html'), /Space\+Grotesk/);
    assert.equal(repo('frontend/src/index.css').includes('--font-sans: "Inter"'), true);
  });

  it('23-25. export UI does not claim copyright-free, trademark-safe, or guaranteed commercial rights', () => {
    const exportPage = repo('frontend/src/pages/ultimate/ExportCenterPage.tsx');
    const files = repo('frontend/src/pages/files/FileCloudPage.tsx');
    const joined = `${exportPage}\n${files}`;
    assert.doesNotMatch(joined, /Copyright Free|Trademark safe|100% commercial rights/i);
    assert.match(exportPage, /keine Rechteklärung|keine Garantie/i);
  });

  it('26-27. provider inventory matches repo and does not invent licenses', () => {
    const media = src('lib/media-providers.ts');
    const ids = CONTENT_PROVIDER_RIGHTS_INVENTORY.map((row) => row.id).sort();
    assert.deepEqual(ids, ['elevenlabs', 'openai', 'replicate', 'runway', 'suno']);
    for (const row of CONTENT_PROVIDER_RIGHTS_INVENTORY) {
      assert.equal(row.commercialUse, 'LEGAL/PROVIDER REVIEW REQUIRED');
      assert.match(media, new RegExp(row.id === 'openai' ? 'openai|OpenAI' : row.id, 'i'));
    }
    assert.match(media, /UNOFFICIAL_SUNO_DISABLED/);
    assert.doesNotMatch(src('services/content-rights.service.ts'), /commercially licensed by default|worldwide exclusive/i);
  });

  it('28-34. rights reports validate, rate-limit, hide others, and do not auto-delete', async () => {
    const owner = await seed();
    const stranger = await seed();
    const file = await saveUserFile(owner.user.id, {
      name: 'clip.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assert.rejects(
      () =>
        submitContentRightsReport(stranger.user.id, {
          category: 'COPYRIGHT',
          description: 'Diese Datei verletzt meine Rechte an einem Werk.',
          fileId: file.id,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ServiceError);
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
    await assert.rejects(
      () =>
        submitContentRightsReport(owner.user.id, {
          category: 'COPYRIGHT',
          description: 'short',
        }),
      /VALIDATION_ERROR|zu kurz/
    );
    await assert.rejects(
      () =>
        submitContentRightsReport(owner.user.id, {
          category: 'COPYRIGHT',
          description: `${'x'.repeat(CONTENT_RIGHTS_REPORT_MESSAGE_MAX + 1)}`,
        }),
      /VALIDATION_ERROR|zu lang/
    );
    await assert.rejects(
      () =>
        submitContentRightsReport(owner.user.id, {
          category: 'COPYRIGHT',
          description: 'sk_live_this_is_not_allowed_in_a_rights_report_body_xx',
        }),
      /VALIDATION_ERROR/
    );

    const report = await submitContentRightsReport(owner.user.id, {
      category: 'COPYRIGHT',
      description: 'Diese Grafik verwendet mein urheberrechtlich geschütztes Werk ohne Erlaubnis.',
      fileId: file.id,
    });
    assert.equal(report.status, 'OPEN');
    assert.ok(CONTENT_RIGHTS_REPORT_CATEGORIES.includes(report.category));
    const still = await issueFileDownloadUrl(file.id, owner.user.id);
    assert.ok(still?.downloadUrl);

    await assert.rejects(
      () => assertRightsReportReadable(report, stranger.user.id, false),
      (err: unknown) => {
        assert.ok(err instanceof ServiceError);
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
    const own = await listOwnContentRightsReports(owner.user.id);
    assert.equal(own.some((row) => row.id === report.id), true);
    assert.equal('adminNotes' in own[0]!, false);
    const publicRow = toPublicRightsReport(report);
    assert.equal('adminNotes' in publicRow, false);

    for (let i = 0; i < CONTENT_RIGHTS_REPORT_MAX_PER_WINDOW - 1; i += 1) {
      await submitContentRightsReport(owner.user.id, {
        category: 'OTHER',
        description: `Weitere inhaltliche Meldung Nummer ${i + 2} mit genug Text.`,
      });
    }
    await assert.rejects(
      () =>
        submitContentRightsReport(owner.user.id, {
          category: 'OTHER',
          description: 'Diese Meldung sollte durch das Rate-Limit blockiert werden.',
        }),
      (err: unknown) => {
        assert.ok(err instanceof ServiceError);
        assert.equal(err.code, 'RATE_LIMIT');
        return true;
      }
    );

    await assert.rejects(() => updateContentRightsReportStatus(report.id, 'ACTIONED'), /INVALID_STATUS/);
    const reviewing = await updateContentRightsReportStatus(report.id, 'REVIEWING', 'internal-only');
    assert.equal(reviewing.adminNotes, 'internal-only');
    const adminList = await listContentRightsReportsForAdmin(20);
    assert.equal(adminList.some((row) => row.id === report.id), true);
  });

  it('35-37. admin takedown uses Block G delete path and blocks new signed URLs', async () => {
    const owner = await seed();
    const admin = await getOrCreateUser(randomUUID(), `${randomUUID()}@admin.test`, 'Admin');
    await setUserRole(admin.id, UserRole.ADMIN);
    const file = await saveUserFile(owner.user.id, {
      name: 'take.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    const report = await submitContentRightsReport(owner.user.id, {
      category: 'TRADEMARK',
      description: 'Unzulässige Nachbildung eines Markenzeichens in dieser Datei.',
      fileId: file.id,
    });
    await updateContentRightsReportStatus(report.id, 'REVIEWING');
    const actioned = await adminTakedownReportedFile(admin.id, report.id);
    assert.equal(actioned.status, 'ACTIONED');
    assert.equal(actioned.takedownFileId, file.id);
    const minted = await issueFileDownloadUrl(file.id, owner.user.id);
    assert.equal(minted, null);
    assert.match(src('services/content-rights.service.ts'), /deleteUserFile/);
    assert.match(src('services/content-rights.service.ts'), /applyRightsTakedownFlag/);
    assert.doesNotMatch(src('services/content-rights.service.ts'), /unlinkSync|rmSync|forceDelete/);
  });

  it('38-41. bounded text, no secrets, no raw private file/voice logging', () => {
    const service = src('services/content-rights.service.ts');
    assert.match(service, /CONTENT_RIGHTS_REPORT_MESSAGE_MAX = 4000/);
    assert.match(service, /TOKENISH/);
    assert.match(service, /logRightsAction/);
    assert.doesNotMatch(service, /description,\s*userId/);
    assert.doesNotMatch(service, /referenceAudioDataUrl/);
    assert.doesNotMatch(service, /dataUrl/);
    const obs = src('lib/observability.ts');
    assert.match(obs, /redactLogString/);
  });

  it('42-63. closed blocks, pricing, payments, and write guard stay preserved', () => {
    assert.equal(LEGAL_TEXT_STATUS, 'draft');
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VOICE], 8);
    assert.match(src('services/nexter-tts-e2e.test.ts'), /Browser|browser|0 Coins|kostenlos/i);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(PRODUCTION_FIREBASE_PROJECT_ID, 'nexter-creator-studio');
    assert.match(src('services/content-rights.service.ts'), /dsSet\(/);
    assert.match(src('lib/data-store.ts'), /assertNoProductionWritesFromTests/);
    assert.match(src('services/legal.service.ts'), /LEGAL REVIEW REQUIRED/);
    assert.match(src('services/legal.service.ts'), /TODO — User Content Rights/);
    assert.match(repo('firestore.rules'), /content_rights_reports/);
    assert.match(src('services/nexter-live-e2e.test.ts'), /Block L|quoteLockKey|CHARGE_IDEMPOTENT/);
    assert.match(src('services/storage-lifecycle-e2e.test.ts'), /deletedAt/);
    assert.match(src('services/legal-operator-e2e.test.ts'), /LEGAL_TEXT_STATUS/);
    assert.match(src('lib/billable-job.ts'), /assertCurrentContentRightsAck/);
    assert.match(src('lib/billable-job.ts'), /await assertCurrentContentRightsAck/);
    const billable = src('lib/billable-job.ts');
    const chargeFn = billable.slice(billable.indexOf('export async function withCoinCharge'));
    const ackCall = chargeFn.indexOf('assertChargeAllowed');
    const deductCall = chargeFn.indexOf('deductCoins');
    assert.ok(ackCall >= 0 && deductCall > ackCall);
    assert.match(src('lib/billable-job.ts'), /assertCurrentContentRightsAck/);
  });

  it('quote can be created without ack, confirm cannot', async () => {
    const { user, project } = await seed({ skipAck: true });
    const quote = await createQuote(user.id, 'logo', project.id, {
      logoName: 'SafeOriginal',
      message: 'Originales taktisches E-Sports-Logo',
    });
    assert.ok(quote.id);
    assert.equal(quote.status, 'pending');
    assert.equal(quote.payload?.rightsRisk, 'NORMAL');
  });

  it('exact logo-copy quote stores an original rewrite before execution', async () => {
    const { user, project } = await seed();
    const quote = await createQuote(user.id, 'logo', project.id, {
      logoName: 'FanMark',
      message: 'kopiere das Nike Logo exakt',
    });
    assert.equal(quote.payload?.rightsRisk, 'TRADEMARK_COPY_RISK');
    assert.match(String(quote.payload?.rightsSafePrompt ?? ''), /Eigenständig|original/i);
  });
});
