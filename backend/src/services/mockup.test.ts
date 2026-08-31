import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOCKUP_CATEGORIES,
  MOCKUP_MODELS,
  mockupColorHex,
  parseMockupIntent,
} from '@ucbs/shared';
import { buildCompositeDataUrl } from './mockup.service.js';

const dir = dirname(fileURLToPath(import.meta.url));
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('phase E — mockup catalog', () => {
  it('covers the seven product tabs including Mehr/tote', () => {
    assert.deepEqual(
      MOCKUP_CATEGORIES.map((c) => c.id),
      ['mug', 'tshirt', 'hoodie', 'cap', 'phone', 'poster', 'tote']
    );
    assert.equal(MOCKUP_CATEGORIES.find((c) => c.id === 'tote')?.label, 'Mehr');
    for (const cat of MOCKUP_CATEGORIES) {
      assert.ok(MOCKUP_MODELS[cat.id].length >= 1, `model for ${cat.id}`);
    }
  });
});

describe('phase E — parseMockupIntent', () => {
  it('maps Zeig mir schwarze Tasse to black mug', () => {
    assert.deepEqual(parseMockupIntent('Zeig mir schwarze Tasse'), { category: 'mug', colorId: 'black' });
  });

  it('maps hoodie and t-shirt separately', () => {
    assert.equal(parseMockupIntent('erstell ein Hoodie Mockup').category, 'hoodie');
    assert.equal(parseMockupIntent('generier ein T-Shirt').category, 'tshirt');
  });
});

describe('phase E — composite without AI', () => {
  it('embeds the design as a real SVG data URL', () => {
    const url = buildCompositeDataUrl({
      category: 'mug',
      colorId: 'black',
      placement: 'front',
      scalePercent: 100,
      designUrl: TINY_PNG,
    });
    assert.ok(url.startsWith('data:image/svg+xml;base64,'));
    const svg = Buffer.from(url.split(',')[1] ?? '', 'base64').toString('utf8');
    assert.match(svg, /<image/);
    assert.match(svg, /#111111/);
    assert.match(svg, /<svg/);
  });

  it('composite path never calls generateImage or withCoinCharge', () => {
    const src = readFileSync(join(dir, 'mockup.service.ts'), 'utf8');
    const start = src.indexOf('export async function generateCompositeMockup');
    const end = src.indexOf('export async function generateLifestyleMockup');
    const composite = src.slice(start, end);
    assert.ok(composite.includes('buildCompositeDataUrl'));
    assert.equal(composite.includes('generateImage'), false);
    assert.equal(composite.includes('withCoinCharge'), false);
    assert.equal(composite.includes('OpenAI'), false);
    assert.equal(composite.includes('Replicate'), false);
  });

  it('lifestyle stays behind Nexter quote, not the composite POST', () => {
    const routes = readFileSync(join(dir, '../routes/mockup.routes.ts'), 'utf8');
    assert.match(routes, /LIFESTYLE_REQUIRES_QUOTE/);
    assert.match(routes, /generateCompositeMockup/);
    assert.equal(routes.includes('generateLifestyleMockup'), false);
    const quotes = readFileSync(join(dir, 'nexter/quotes.service.ts'), 'utf8');
    assert.match(quotes, /kind === 'mockup'/);
    assert.match(quotes, /generateLifestyleMockup/);
  });
});

describe('phase E — isolation helpers', () => {
  it('color lookup falls back instead of leaking another palette', () => {
    assert.equal(mockupColorHex('white'), '#F5F5F5');
    assert.equal(mockupColorHex('unknown-user-color'), '#F5F5F5');
  });
});
