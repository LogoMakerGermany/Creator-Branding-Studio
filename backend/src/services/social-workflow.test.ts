import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  CONTENT_PLATFORMS,
  TEXT_KINDS,
  SOCIAL_TONES,
  SOCIAL_PLANNER_PLATFORMS,
  defaultSocialConfig,
  buildSocialContentBrief,
  parseSocialIntent,
  parseTextIntent,
  socialNeedsFollowUp,
  detectSocialPlannerIntent,
  normalizeHashtags,
  detectDnaChangeScope,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { getActiveDna, upsertDna } from './dna.service.js';
import { createProject, getProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { dsSet } from '../lib/data-store.js';
import {
  generateContentPackage,
  getContentPackage,
  listTextJobs,
  resolveContentSource,
  setTextTestHooks,
  updateContentPackageFields,
} from './text.service.js';
import {
  createSocialPost,
  deleteSocialPost,
  getSocialPost,
  listSocialPosts,
  updateSocialPost,
} from './social.service.js';
import { listCalendarEvents } from './calendar.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind, detectExternalPublishIntent, detectTextQuoteIntent } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { setLogoTestHooks } from './logo.service.js';
import { requireOwnedLogoJob } from './streamset.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setTextTestHooks(null);
  setLogoTestHooks(null);
});

after(() => {
  setTextTestHooks(null);
  setLogoTestHooks(null);
});

async function seed(opts?: { dna?: boolean }) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@social-close.test`, 'Nova');
  const dna =
    opts?.dna === false
      ? null
      : await upsertDna({
          userId: user.id,
          name: 'NightWolf',
          mascot: 'Cyber-Wolf',
          styleDirection: 'neon',
          primaryColors: ['#1E40AF'],
          brandingStyle: 'esports',
          targetPlatforms: ['tiktok', 'twitch'],
        });
  const project = await createProject(user.id, {
    name: 'Social Brand',
    type: 'social',
    dnaId: dna?.id,
  });
  return { user, dna, project };
}

describe('social closure — config, platforms, types', () => {
  it('keeps catalog platforms and content types without fake facebook/general', () => {
    assert.deepEqual(
      CONTENT_PLATFORMS.map((p) => p.id),
      ['tiktok', 'youtube', 'youtube-shorts', 'instagram', 'twitch', 'discord']
    );
    for (const p of CONTENT_PLATFORMS) assert.equal(p.publishingAvailable, false);
    assert.ok(TEXT_KINDS.includes('package'));
    assert.ok(TEXT_KINDS.includes('tiktok-caption'));
    assert.ok(TEXT_KINDS.includes('twitch-title'));
    assert.ok(SOCIAL_TONES.includes('funny'));
    assert.ok(SOCIAL_PLANNER_PLATFORMS.includes('twitter'));
    const cfg = defaultSocialConfig({ platform: 'tiktok', contentType: 'package', topic: 'Raid', tone: 'hype' });
    assert.match(buildSocialContentBrief(cfg), /CONTENT BRIEF \/ VORSCHAU/);
    assert.match(cfg.summary, /TikTok/);
    assert.equal(defaultSocialConfig({ platform: 'nope' as 'tiktok' }).platform, 'tiktok');
  });

  it('validates hashtags: empty, dupes, count', () => {
    assert.deepEqual(normalizeHashtags(['NightWolf', '#NightWolf', '', 'x', 'gaming']), ['NightWolf', 'gaming']);
    const many = Array.from({ length: 40 }, (_, i) => `tag${i}`);
    assert.equal(normalizeHashtags(many).length, 30);
  });
});

describe('social closure — nexter intent and follow-ups', () => {
  it('maps social phrasing to text quotes and planner without publish', () => {
    assert.equal(detectQuoteKind('Schreib mir einen TikTok-Post.'), 'text');
    assert.equal(detectQuoteKind('Mach eine Ankündigung für meinen Stream heute Abend.'), 'text');
    assert.equal(detectQuoteKind('Schreib mir eine Beschreibung für mein neues YouTube-Video.'), 'text');
    assert.equal(detectQuoteKind('Mach mir passende Hashtags.'), 'text');
    assert.equal(detectQuoteKind('Mach mir daraus einen Discord-Post.'), 'text');
    assert.equal(detectQuoteKind('Schreib einen TikTok-Post für mein letztes Logo.'), 'text');
    assert.equal(detectSocialPlannerIntent('Plane mir Content für nächste Woche.'), true);
    assert.equal(detectTextQuoteIntent('Plane mir Content für nächste Woche.'), false);
    assert.equal(detectQuoteKind('Plane mir Content für nächste Woche.'), null);
    assert.match(detectExternalPublishIntent('Veröffentliche das auf TikTok') ?? '', /nicht verfügbar/i);
    const tiktok = parseTextIntent('Schreib mir einen TikTok-Post.');
    assert.equal(tiktok.platform, 'tiktok');
    assert.equal(tiktok.kind, 'package');
    const live = parseTextIntent('Mach eine Ankündigung für meinen Stream heute Abend.');
    assert.equal(live.platform, 'twitch');
    const logo = parseTextIntent('Schreib einen TikTok-Post für mein letztes Logo.');
    assert.equal(logo.wantLastLogo, true);
  });

  it('asks follow-ups only when platform or topic is missing', async () => {
    assert.equal(socialNeedsFollowUp('Mach mir einen Post.'), true);
    assert.equal(socialNeedsFollowUp('Schreib mir einen TikTok-Post.', { dnaName: 'NightWolf' }), false);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@social-fu.test`, 'Ask');
    const session = await nexterChat(user.id, 'Mach mir einen Post.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Plattform|Thema/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('planner intent opens social studio without quoting', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@social-plan.test`, 'Plan');
    const session = await nexterChat(user.id, 'Plane mir Content für nächste Woche.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /intern|nicht automatisch/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
    assert.ok((last?.actions ?? []).some((a) => a.path?.includes('/social-studio')));
  });

  it('does not silently change DNA on social requests', async () => {
    assert.equal(detectDnaChangeScope('Schreib mir einen TikTok-Post.'), null);
    const { user, dna } = await seed();
    const before = dna!.version;
    const session = await nexterChat(user.id, 'Schreib mir einen TikTok-Post.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation' || a.tool === 'start_generation'), true);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
  });
});

describe('social closure — quote, mock provider, ownership', () => {
  it('blocks direct paid generation and client price manipulation', async () => {
    const routes = src('../routes/text.routes.ts');
    assert.match(routes, /TEXT_REQUIRES_QUOTE/);
    assert.equal(routes.includes('generateContentPackage('), false);
    const quotes = src('nexter/quotes.service.ts');
    assert.match(quotes, /kind === 'text'/);
    assert.match(quotes, /PRICE_CHANGED/);
    const { user, project } = await seed();
    const cheap = await createQuote(user.id, 'text', project.id, { kind: 'package', topic: 'raid', platforms: ['tiktok'] }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
    assert.equal((await listTextJobs(user.id)).length, 0);
  });

  it('insufficient coins starts no job and no provider', async () => {
    const { user, project } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'text', project.id, { kind: 'package', topic: 'raid', platforms: ['tiktok'] });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listTextJobs(user.id)).length, 0);
  });

  it('double confirm is one charge and one job', async () => {
    const { user, project } = await seed();
    setTextTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'text', project.id, { kind: 'package', topic: 'Raid Night', platforms: ['tiktok'] });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    assert.equal(before - (await getCoinBalance(user.id)), COIN_COSTS[CoinSpendCategory.TEXT_GENERATION]);
  });

  it('works without DNA and persists owned result', async () => {
    const { user, project } = await seed({ dna: false });
    assert.equal(await getActiveDna(user.id), null);
    setTextTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'text', project.id, {
      kind: 'package',
      topic: 'Solo Drop',
      platforms: ['tiktok'],
      tone: 'neutral',
    });
    const res = await confirmQuote(user.id, quote.id);
    const job = await getContentPackage(res.jobIds[0]!, user.id);
    assert.equal(job?.userId, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.version, 1);
    assert.match(job?.caption ?? '', /Solo Drop|tiktok/i);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@social-b.test`, 'B');
    assert.equal(await getContentPackage(job!.id, other.id), null);
  });

  it('mock failure refunds; success uses mock not OpenAI', async () => {
    const { user, project } = await seed();
    setTextTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'text', project.id, { kind: 'package', topic: 'raid', platforms: ['tiktok'] });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);
    setTextTestHooks({ result: 'success' });
    const ok = await createQuote(user.id, 'text', project.id, { kind: 'package', topic: 'raid', platforms: ['discord'] });
    const res = await confirmQuote(user.id, ok.id);
    const job = await getContentPackage(res.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.ok(job?.platformVariants?.discord || job?.caption);
  });

  it('manual edit costs 0 coins, versions, and rejects foreign editors', async () => {
    const { user, project } = await seed();
    setTextTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'text', project.id, { kind: 'package', topic: 'Edit me', platforms: ['tiktok'] });
    const res = await confirmQuote(user.id, quote.id);
    const before = await getCoinBalance(user.id);
    const edited = await updateContentPackageFields(res.jobIds[0]!, user.id, { caption: 'Manuell kürzer.' });
    assert.equal(edited.caption, 'Manuell kürzer.');
    assert.ok((edited.version ?? 1) >= 2);
    assert.equal(await getCoinBalance(user.id), before);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@social-edit.test`, 'E');
    await assert.rejects(() => updateContentPackageFields(res.jobIds[0]!, other.id, { caption: 'hack' }));
  });

  it('AI variant writes a new version instead of clobbering v1', async () => {
    const { user, project } = await seed();
    setTextTestHooks({ result: 'success' });
    const first = await confirmQuote(
      user.id,
      (await createQuote(user.id, 'text', project.id, { kind: 'package', topic: 'Base', platforms: ['tiktok'] })).id
    );
    const original = await getContentPackage(first.jobIds[0]!, user.id);
    const variantQuote = await createQuote(user.id, 'text', project.id, {
      kind: 'package',
      topic: 'Base',
      platforms: ['discord'],
      packageId: original!.id,
    });
    const second = await confirmQuote(user.id, variantQuote.id);
    const variant = await getContentPackage(second.jobIds[0]!, user.id);
    assert.notEqual(variant!.id, original!.id);
    assert.equal(variant!.parentPackageId, original!.id);
    assert.ok((variant!.version ?? 1) >= 2);
    const still = await getContentPackage(original!.id, user.id);
    assert.equal(still?.caption, original?.caption);
  });

  it('change request quotes again and stays in social scope', async () => {
    const { user, project, dna } = await seed();
    setTextTestHooks({ result: 'success' });
    const first = await confirmQuote(
      user.id,
      (await createQuote(user.id, 'text', project.id, { kind: 'package', topic: 'Stream', platforms: ['twitch'] })).id
    );
    const change = await createQuote(user.id, 'text', project.id, {
      packageId: first.jobIds[0],
      revisionField: 'caption',
      revisionInstruction: 'Kürzer. Mehr Humor.',
      kind: 'package',
    });
    const res = await confirmQuote(user.id, change.id);
    const job = await getContentPackage(res.jobIds[0]!, user.id);
    assert.ok((job?.revisions.length ?? 0) >= 1);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna!.version);
  });

  it('accepts own project/logo and rejects foreign ones', async () => {
    const a = await seed();
    const b = await seed();
    await assert.rejects(
      () => resolveContentSource(a.user.id, { sourceType: 'project', projectId: b.project.id, topic: 'x' }),
      /nicht gefunden/
    );
    const own = await resolveContentSource(a.user.id, { sourceType: 'project', projectId: a.project.id, topic: 'raid' });
    assert.equal(own.sourceType, 'project');
    setLogoTestHooks({ result: 'success' });
    const logoRes = await confirmQuote(
      a.user.id,
      (await createQuote(a.user.id, 'logo', a.project.id, { logoName: 'NightWolf', width: 400, height: 400 })).id
    );
    const logo = await requireOwnedLogoJob(a.user.id, logoRes.jobIds[0]!);
    const sourced = await resolveContentSource(a.user.id, { sourceType: 'logo', sourceAssetId: logo.id, topic: 'drop' });
    assert.equal(sourced.sourceAssetId, logo.id);
    await assert.rejects(
      () => resolveContentSource(b.user.id, { sourceType: 'logo', sourceAssetId: logo.id, topic: 'drop' }),
      /nicht gefunden/
    );
    setTextTestHooks({ result: 'success' });
    const lastLogo = await confirmQuote(
      a.user.id,
      (
        await createQuote(a.user.id, 'text', a.project.id, {
          kind: 'package',
          topic: 'Logo Drop',
          platforms: ['tiktok'],
          wantLastLogo: true,
          sourceType: 'logo',
        })
      ).id
    );
    const pkg = await getContentPackage(lastLogo.jobIds[0]!, a.user.id);
    assert.equal(pkg?.sourceType, 'logo');
    assert.equal(await getProject(a.project.id, b.user.id), null);
  });
});

describe('social closure — planner, calendar, schedule, copy vs publish', () => {
  it('plans, edits, deletes owned posts and validates schedule', async () => {
    const { user, project } = await seed();
    setTextTestHooks({ result: 'success' });
    const created = await confirmQuote(
      user.id,
      (await createQuote(user.id, 'text', project.id, { kind: 'package', topic: 'Plan me', platforms: ['tiktok'] })).id
    );
    await assert.rejects(
      () =>
        createSocialPost(user.id, {
          platform: 'tiktok',
          content: 'bad date',
          scheduledAt: 'not-a-date',
          packageId: created.jobIds[0],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DATE'
    );
    const when = new Date(Date.now() + 3600_000).toISOString();
    const post = await createSocialPost(user.id, {
      platform: 'tiktok',
      content: 'Interner Entwurf',
      scheduledAt: when,
      packageId: created.jobIds[0],
      projectId: project.id,
    });
    assert.equal(post.plannerStatus, 'scheduled');
    assert.equal(post.publishingAvailable, false);
    assert.equal(post.version, 1);
    const events = await listCalendarEvents(user.id);
    assert.ok(events.some((e) => e.startAt === post.scheduledAt));
    const edited = await updateSocialPost(post.id, user.id, { content: 'Aktualisiert intern' });
    assert.equal(edited.content, 'Aktualisiert intern');
    assert.equal(edited.version, 2);
    const reloaded = await listSocialPosts(user.id);
    assert.equal(reloaded[0]?.content, 'Aktualisiert intern');
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@social-plan-b.test`, 'B');
    assert.equal(await getSocialPost(post.id, other.id), null);
    await assert.rejects(() => updateSocialPost(post.id, other.id, { content: 'hack' }));
    await assert.rejects(() => deleteSocialPost(post.id, other.id));
    await deleteSocialPost(post.id, user.id);
    assert.equal(await getSocialPost(post.id, user.id), null);
  });

  it('ui and routes never expose fake publishing or paid text providers in tests', () => {
    const page = src('../../../frontend/src/pages/studios/SocialStudioPage.tsx');
    assert.match(page, /Text kopieren/);
    assert.equal(page.includes('Auf TikTok posten'), false);
    assert.equal(page.includes('garantiert viral'), false);
    assert.match(page, /CONTENT BRIEF \/ VORSCHAU/);
    assert.match(page, /Für .* Coins erstellen/);
    assert.match(page, /htmlFor/);
    assert.match(page, /min-h-11/);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const textSrc = src('text.service.ts');
    assert.match(textSrc, /isPaidProviderTestBlocked/);
    assert.match(textSrc, /setTextTestHooks/);
    assert.equal(textSrc.includes('stripe'), false);
    assert.equal(textSrc.includes('paypal'), false);
  });
});
