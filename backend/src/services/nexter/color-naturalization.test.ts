import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  formatColorsForNexter,
  humanColorName,
  messageAsksExactColorCode,
  parseCssColor,
} from '@ucbs/shared';
import { getOrCreateUser } from '../user.service.js';
import { getActiveDna, upsertDna } from '../dna.service.js';
import { getCoinBalance } from '../coins.service.js';
import { nexterChat } from './conversation.service.js';
import { listOwnedQuotes } from './quotes.service.js';
import { formatContextForPrompt } from './tools.service.js';
import { buildNexterContext } from './context.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

function lastAssistant(session: {
  messages: Array<{ role: string; content: string; actions?: Array<{ tool: string }> }>;
}) {
  const last = session.messages.at(-1);
  assert.equal(last?.role, 'assistant');
  return last!;
}

describe('nexter color naturalization', () => {
  it('maps classic HEX values to German color names', () => {
    assert.equal(humanColorName('#000000'), 'Schwarz');
    assert.equal(humanColorName('#FFFFFF'), 'Weiß');
    assert.equal(humanColorName('#FF0000'), 'Rot');
    assert.equal(humanColorName('#00FF00'), 'Grün');
    assert.equal(humanColorName('#0000FF'), 'Blau');
    assert.match(humanColorName('#20e0ee'), /Türkis|Cyan/i);
    assert.match(humanColorName('#20e0ee'), /leuchtend/i);
    assert.match(humanColorName('#1E40AF'), /Blau/i);
    assert.match(humanColorName('#7C3AED'), /Violett|Lila|Magenta/i);
    assert.equal(humanColorName('#fff'), 'Weiß');
    assert.equal(humanColorName('rgb(255, 0, 0)'), 'Rot');
  });

  it('handles other valid HEX colors without crashing on invalid input', () => {
    assert.match(humanColorName('#22c55e'), /Grün/i);
    assert.match(humanColorName('#f59e0b'), /Orange|Gelb/i);
    assert.equal(humanColorName('#gggggg'), '#gggggg');
    assert.equal(humanColorName(''), 'unbenannte Farbe');
    assert.equal(humanColorName(null), 'unbenannte Farbe');
    assert.equal(parseCssColor('not-a-color'), null);
    assert.doesNotThrow(() => formatColorsForNexter(['#000000', 'nope', 12, undefined]));
    assert.match(formatColorsForNexter(['#000000', '#20e0ee']), /Schwarz/);
    assert.match(formatColorsForNexter(['#000000', '#20e0ee']), /Türkis|Cyan/i);
    assert.doesNotMatch(formatColorsForNexter(['#000000', '#20e0ee']), /#000000|#20e0ee/i);
    assert.match(formatColorsForNexter(['#000000'], { includeHex: true }), /#000000/i);
  });

  it('asks for HEX/Farbcode/RGB only when the user is explicit', () => {
    assert.equal(messageAsksExactColorCode('Welche Farben würdest du für meinen Kanal empfehlen?'), false);
    assert.equal(messageAsksExactColorCode('Wie ist der HEX-Farbcode meiner DNA-Farben?'), true);
    assert.equal(messageAsksExactColorCode('Nenn mir bitte RGB'), true);
    assert.equal(messageAsksExactColorCode('Was ist der exakte Farbwert?'), true);
  });

  it('keeps stored Creator DNA HEX and naturalizes CREATOR_ADVICE without quote or debit', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@color-nat.test`, 'ColorNat');
    const dna = await upsertDna({
      userId: user.id,
      name: 'NightWolf',
      mascot: 'Cyber-Wolf',
      styleDirection: 'neon',
      primaryColors: ['#000000', '#20e0ee'],
    });
    assert.deepEqual(dna.primaryColors.slice(0, 2), ['#000000', '#20e0ee']);
    const ctx = await buildNexterContext(user.id);
    assert.deepEqual(ctx.primaryColors.slice(0, 2), ['#000000', '#20e0ee']);
    const prompt = formatContextForPrompt(ctx);
    assert.match(prompt, /Schwarz/);
    assert.match(prompt, /Türkis|Cyan/i);
    assert.doesNotMatch(prompt, /#000000|#20e0ee/i);
    const withHex = formatContextForPrompt(ctx, { includeExactColorCodes: true });
    assert.match(withHex, /#000000/i);
    assert.match(withHex, /#20e0ee/i);

    const before = await getCoinBalance(user.id);
    const quotesBefore = (await listOwnedQuotes(user.id)).length;
    const advice = lastAssistant(await nexterChat(user.id, 'Welche Farben würdest du für meinen Kanal empfehlen?'));
    assert.match(advice.content, /Schwarz/i);
    assert.match(advice.content, /Türkis|Cyan/i);
    assert.doesNotMatch(advice.content, /#000000|#20e0ee/i);
    assert.equal((advice.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore);

    const hexAsk = lastAssistant(
      await nexterChat(user.id, 'Welche Farben würdest du für meinen Kanal empfehlen, und wie ist der HEX-Code?')
    );
    assert.match(hexAsk.content, /#000000|#20e0ee/i);
    assert.equal((hexAsk.actions ?? []).some((a) => a.tool === 'start_generation'), false);

    const stored = await getActiveDna(user.id);
    assert.deepEqual(stored?.primaryColors.slice(0, 2), ['#000000', '#20e0ee']);
  });
});
