import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPENAI_GPT_IMAGE_EDIT_ENDPOINT,
  OPENAI_GPT_IMAGE_EDIT_MODEL,
  OPENAI_GPT_IMAGE_EDIT_TIMEOUT_MS,
  assertAllowedImageEditModel,
  editGptImage,
  setOpenAiImageEditFetchForTests,
} from './openai-image-edit.js';
import { OPENAI_GPT_IMAGE_ENDPOINT, OPENAI_GPT_IMAGE_TIMEOUT_MS } from './openai-image.js';
import { ServiceError } from './errors.js';
import { IMAGE_PROVIDER_FAILED_MESSAGE } from './media-providers.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';
process.env.OPENAI_API_KEY = 'sk-test-not-real-openai';

const dir = dirname(fileURLToPath(import.meta.url));
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BUFFER = Buffer.from(PNG_B64, 'base64');

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setOpenAiImageEditFetchForTests(null);
});

describe('V.1 OpenAI image-edit adapter', () => {
  it('uses the official edits endpoint, sunburst model, bounded timeout, and never generations', () => {
    assert.equal(OPENAI_GPT_IMAGE_EDIT_ENDPOINT, 'https://api.openai.com/v1/images/edits');
    assert.equal(OPENAI_GPT_IMAGE_EDIT_MODEL, 'gpt-image-2.5-sunburst');
    assert.equal(OPENAI_GPT_IMAGE_EDIT_TIMEOUT_MS, OPENAI_GPT_IMAGE_TIMEOUT_MS);
    assert.equal(OPENAI_GPT_IMAGE_EDIT_TIMEOUT_MS, 130_000);
    assert.equal(OPENAI_GPT_IMAGE_ENDPOINT, 'https://api.openai.com/v1/images/generations');
    const editSrc = src('openai-image-edit.ts');
    assert.match(editSrc, /AbortSignal\.timeout\(OPENAI_GPT_IMAGE_EDIT_TIMEOUT_MS\)/);
    assert.doesNotMatch(editSrc, /OPENAI_GPT_IMAGE_ENDPOINT|images\/generations'/);
    assert.doesNotMatch(editSrc, /generateGptImage/);
    assert.doesNotMatch(editSrc, /gpt-image-1\.5/);
    assert.doesNotMatch(editSrc, /for\s*\(.*retry|while\s*\(.*retry/);
    assert.doesNotMatch(editSrc, /res\.text\(\)/);
    assert.throws(() => assertAllowedImageEditModel('gpt-image-1.5'), (err: unknown) => {
      return err instanceof ServiceError && err.code === 'INVALID_MODEL';
    });
    assert.equal(assertAllowedImageEditModel(), OPENAI_GPT_IMAGE_EDIT_MODEL);
  });

  it('uploads multipart source bytes and accepts only b64 PNG output', async () => {
    let capturedUrl = '';
    let capturedBody: FormData | null = null;
    setOpenAiImageEditFetchForTests(async (input, init) => {
      capturedUrl = String(input);
      capturedBody = init?.body as FormData;
      return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }], usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const result = await editGptImage({
      sourceImage: PNG_BUFFER,
      sourceMimeType: 'image/png',
      prompt: 'Change only the text to TreffNix.',
    });
    assert.equal(capturedUrl, OPENAI_GPT_IMAGE_EDIT_ENDPOINT);
    assert.ok(capturedBody);
    assert.equal(capturedBody!.get('model'), OPENAI_GPT_IMAGE_EDIT_MODEL);
    assert.equal(capturedBody!.get('n'), '1');
    assert.equal(capturedBody!.get('output_format'), 'png');
    assert.equal(result.mimeType, 'image/png');
    assert.ok(result.buffer.equals(PNG_BUFFER));
    assert.equal(result.usage?.total_tokens, 20);
  });

  it('rejects empty/malformed output and sanitizes provider errors', async () => {
    setOpenAiImageEditFetchForTests(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await assert.rejects(() => editGptImage({ sourceImage: PNG_BUFFER, sourceMimeType: 'image/png', prompt: 'x' }), (err: unknown) => {
      return err instanceof ServiceError && err.code === 'PROVIDER_INVALID_PAYLOAD' && err.message === IMAGE_PROVIDER_FAILED_MESSAGE;
    });
    setOpenAiImageEditFetchForTests(async () => new Response(JSON.stringify({ error: { message: 'sk-live-secret' } }), { status: 400 }));
    await assert.rejects(() => editGptImage({ sourceImage: PNG_BUFFER, sourceMimeType: 'image/png', prompt: 'x' }), (err: unknown) => {
      return err instanceof ServiceError && !String((err as ServiceError).message).includes('sk-live');
    });
  });
});
