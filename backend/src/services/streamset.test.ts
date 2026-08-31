import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COIN_COSTS,
  CoinSpendCategory,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_PACK_ITEMS,
  STREAMSET_TABS,
  jobMatchesStreamsetAsset,
  missingStreamsetLabels,
  optionsForStreamsetItem,
  pickJobForStreamsetAsset,
  resolveStreamsetAssetKey,
  streamsetAssetPresent,
} from '@ucbs/shared';
import { streamsetCatalogKeys } from './streamset.service.js';

describe('phase D — streamset catalog', () => {
  it('covers screens, overlays, banner, facecam and sticker', () => {
    const keys = STREAMSET_PACK_ITEMS.map((i) => i.key);
    for (const required of [
      'starting-soon',
      'brb',
      'offline',
      'ending',
      'just-chatting',
      'hud',
      'panel',
      'alert',
      'twitch-banner',
      'youtube-banner',
      'facecam',
      'sticker',
    ]) {
      assert.ok(keys.includes(required), `missing ${required}`);
    }
    assert.equal(STREAMSET_PACK_ITEMS.length, 12);
    assert.deepEqual(
      STREAMSET_TABS.map((t) => t.id),
      ['screens', 'overlays', 'banner', 'facecam', 'sticker']
    );
    assert.equal(STREAMSET_PACK_COIN_COST, COIN_COSTS[CoinSpendCategory.STREAMSET_PACK]);
    assert.equal(STREAMSET_PACK_COIN_COST, 50);
    assert.deepEqual(streamsetCatalogKeys(), keys);
  });

  it('maps legacy kind overlay to starting-soon', () => {
    assert.equal(resolveStreamsetAssetKey(undefined, 'overlay')?.key, 'starting-soon');
    assert.equal(resolveStreamsetAssetKey('hud')?.overlayType, 'hud');
    assert.equal(resolveStreamsetAssetKey('unknown'), undefined);
  });

  it('banner options include a real platform', () => {
    const twitch = STREAMSET_PACK_ITEMS.find((i) => i.key === 'twitch-banner')!;
    const opts = optionsForStreamsetItem(twitch, 'gaming') as { platform?: string };
    assert.equal(opts.platform, 'twitch');
    const overlay = STREAMSET_PACK_ITEMS.find((i) => i.key === 'starting-soon')!;
    const overlayOpts = optionsForStreamsetItem(overlay) as { overlayType?: string };
    assert.equal(overlayOpts.overlayType, 'starting-soon');
  });
});

describe('phase D — missing asset status', () => {
  const startingSoon = STREAMSET_PACK_ITEMS.find((i) => i.key === 'starting-soon')!;
  const twitchBanner = STREAMSET_PACK_ITEMS.find((i) => i.key === 'twitch-banner')!;
  const facecam = STREAMSET_PACK_ITEMS.find((i) => i.key === 'facecam')!;

  it('treats keyed completed jobs as present', () => {
    const jobs = [
      {
        status: 'completed',
        imageUrl: 'https://example.com/soon.png',
        module: 'overlay',
        assetKey: 'starting-soon',
      },
    ];
    assert.equal(streamsetAssetPresent(startingSoon, jobs), true);
    assert.equal(streamsetAssetPresent(twitchBanner, jobs), false);
    assert.ok(missingStreamsetLabels(jobs).includes('Twitch Banner'));
    assert.equal(missingStreamsetLabels(jobs).includes('Starting Soon'), false);
  });

  it('does not mark overlays present from a generic overlay without assetKey', () => {
    const jobs = [
      { status: 'completed', imageUrl: 'https://example.com/x.png', module: 'overlay' },
    ];
    assert.equal(streamsetAssetPresent(startingSoon, jobs), false);
    assert.equal(jobMatchesStreamsetAsset(startingSoon, jobs[0]), false);
  });

  it('falls back to module for pre-phase-D banner/facecam jobs', () => {
    const jobs = [
      { status: 'completed', imageUrl: 'https://example.com/b.png', module: 'banner' },
      { status: 'completed', imageUrl: 'https://example.com/f.png', module: 'facecam' },
    ];
    assert.equal(streamsetAssetPresent(twitchBanner, jobs), true);
    assert.equal(streamsetAssetPresent(facecam, jobs), true);
    const youtube = STREAMSET_PACK_ITEMS.find((i) => i.key === 'youtube-banner')!;
    assert.equal(streamsetAssetPresent(youtube, jobs), false);
  });

  it('picks the keyed job over a generic module match', () => {
    const jobs = [
      {
        status: 'completed',
        imageUrl: 'https://example.com/keyed.png',
        module: 'overlay',
        assetKey: 'hud',
      },
      { status: 'completed', imageUrl: 'https://example.com/old.png', module: 'banner' },
    ];
    const hud = STREAMSET_PACK_ITEMS.find((i) => i.key === 'hud')!;
    assert.equal(pickJobForStreamsetAsset(hud, jobs)?.assetKey, 'hud');
    assert.equal(pickJobForStreamsetAsset(twitchBanner, jobs)?.module, 'banner');
  });

  it('failed jobs are not present', () => {
    const jobs = [
      { status: 'failed', module: 'overlay', assetKey: 'starting-soon', error: 'no provider' },
    ];
    assert.equal(streamsetAssetPresent(startingSoon, jobs), false);
  });
});

describe('phase D — user isolation of jobs', () => {
  it('user B jobs do not satisfy user A catalog', () => {
    const userAJobs = [
      {
        status: 'completed',
        imageUrl: 'https://example.com/a.png',
        module: 'facecam',
        assetKey: 'facecam',
      },
    ];
    const userBJobs: typeof userAJobs = [];
    const facecam = STREAMSET_PACK_ITEMS.find((i) => i.key === 'facecam')!;
    assert.equal(streamsetAssetPresent(facecam, userAJobs), true);
    assert.equal(streamsetAssetPresent(facecam, userBJobs), false);
    assert.ok(missingStreamsetLabels(userBJobs).includes('Facecam'));
  });
});
