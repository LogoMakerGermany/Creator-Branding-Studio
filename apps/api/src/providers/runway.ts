import { requireApiKey } from '../config.js';

export async function generateVideoRunway(prompt: string, duration: number): Promise<Buffer> {
  const apiKey = requireApiKey('runway');
  const res = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      promptText: prompt,
      duration,
      model: 'gen3a_turbo',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Runway API Fehler: ${err}`);
  }
  const data = await res.json() as { output?: string[] };
  const url = data.output?.[0];
  if (!url) throw new Error('Runway: Keine Video-URL');
  const videoRes = await fetch(url);
  return Buffer.from(await videoRes.arrayBuffer());
}
