import OpenAI from 'openai';
import { requireApiKey } from '../config.js';
import { buildNegativePrompt } from '../engines/magicPrompt.js';
import type { BrandDNA } from '@cbs/shared';

export async function generateImage(prompt: string, size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024'): Promise<Buffer> {
  const client = new OpenAI({ apiKey: requireApiKey('openai') });
  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt: `${prompt}. ${buildNegativePrompt()}`,
    n: 1,
    size,
    response_format: 'b64_json',
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI: Keine Bilddaten erhalten');
  return Buffer.from(b64, 'base64');
}

export async function extractDNAFromVision(
  imageBase64: string,
  mimeType: string,
  brandName?: string,
): Promise<Partial<BrandDNA>> {
  const client = new OpenAI({ apiKey: requireApiKey('openai') });
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Du extrahierst Brand-DNA als JSON. Felder: primaryColors (hex array), secondaryColors, accentColors, fonts {heading,body,accent}, logoShapes, characters, symbols, glowStrength (0-1), neonStrength (0-1), lightBehavior, textureBehavior, brandingStyle, platformPreferences. Gaming/esports Stil.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Extrahiere Brand-DNA${brandName ? ` für "${brandName}"` : ''}.` },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('DNA-Extraktion fehlgeschlagen');
  return JSON.parse(content);
}

export async function classifyCopyright(text: string): Promise<{ flagged: boolean; reason?: string }> {
  const client = new OpenAI({ apiKey: requireApiKey('openai') });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Prüfe auf geschützte Marken, Franchises, Figuren. Antwort: {flagged: boolean, reason?: string}' },
      { role: 'user', content: text },
    ],
  });
  const content = response.choices[0]?.message?.content;
  return content ? JSON.parse(content) : { flagged: false };
}
