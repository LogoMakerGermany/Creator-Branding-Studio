import Replicate from 'replicate';
import { requireApiKey } from '../config.js';

export async function generateImageReplicate(prompt: string): Promise<Buffer> {
  const replicate = new Replicate({ auth: requireApiKey('replicate') });
  const output = await replicate.run(
    'black-forest-labs/flux-schnell',
    { input: { prompt, num_outputs: 1, aspect_ratio: '1:1', output_format: 'png' } },
  ) as string[];
  const url = Array.isArray(output) ? output[0] : output;
  if (!url || typeof url !== 'string') throw new Error('Replicate: Keine Bild-URL erhalten');
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

export async function generateVideoReplicate(prompt: string, duration: number): Promise<Buffer> {
  const replicate = new Replicate({ auth: requireApiKey('replicate') });
  const output = await replicate.run(
    'minimax/video-01',
    { input: { prompt, prompt_optimizer: true } },
  );
  const url = typeof output === 'string' ? output : Array.isArray(output) ? output[0] : null;
  if (!url || typeof url !== 'string') throw new Error('Replicate Video: Keine Ausgabe');
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  void duration;
  return buffer;
}
