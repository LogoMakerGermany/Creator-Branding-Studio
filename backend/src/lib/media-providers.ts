import {
  isProduction,
  getElevenLabsApiKey,
  getElevenLabsVoiceId,
  getReplicateApiToken,
  getSunoApiKey,
  getRunwayApiKey,
  getReplicateVideoModel,
  hasImageAiProvider,
} from '../config/env.js';
import { ServiceError } from './errors.js';

export async function generateSpeech(
  text: string,
  options?: { voiceId?: string }
): Promise<{ audioUrl: string; provider: string }> {
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) {
    if (isProduction()) {
      throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'ElevenLabs API Key fehlt (ELEVENLABS_API_KEY)');
    }
    throw new Error('ELEVENLABS_API_KEY nicht konfiguriert');
  }

  const voiceId = options?.voiceId || getElevenLabsVoiceId();
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs error: ${await res.text()}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const dataUrl = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
  return { audioUrl: dataUrl, provider: 'elevenlabs' };
}

export async function generateMusic(
  prompt: string,
  options?: { duration?: number; title?: string }
): Promise<{ audioUrl: string; provider: string; duration: number }> {
  if (getReplicateApiToken()) {
    try {
      return await generateMusicWithReplicate(prompt, options?.duration ?? 30);
    } catch (err) {
      console.warn('[Media] Replicate music failed:', err);
    }
  }

  if (getSunoApiKey()) {
    return generateMusicWithSuno(prompt, options);
  }

  if (isProduction()) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Musik-Generierung benötigt REPLICATE_API_TOKEN oder SUNO_API_KEY'
    );
  }

  throw new Error('Kein Musik-Provider konfiguriert');
}

async function generateMusicWithReplicate(
  prompt: string,
  duration: number
): Promise<{ audioUrl: string; provider: string; duration: number }> {
  const token = getReplicateApiToken()!;
  const createRes = await fetch('https://api.replicate.com/v1/models/meta/musicgen/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=120',
    },
    body: JSON.stringify({
      input: {
        prompt,
        duration: Math.min(duration, 30),
        model_version: 'stereo-large',
      },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Replicate music error: ${await createRes.text()}`);
  }

  let prediction = (await createRes.json()) as {
    id: string;
    status: string;
    output?: string;
    error?: string;
  };

  let attempts = 0;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 90) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    prediction = await pollRes.json();
    attempts++;
  }

  if (prediction.status === 'failed' || !prediction.output) {
    throw new Error(prediction.error || 'Music generation failed');
  }

  return { audioUrl: prediction.output, provider: 'replicate-musicgen', duration };
}

async function generateMusicWithSuno(
  prompt: string,
  options?: { duration?: number; title?: string }
): Promise<{ audioUrl: string; provider: string; duration: number }> {
  const res = await fetch('https://api.sunoapi.org/api/v1/generate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSunoApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      title: options?.title || 'UCBS Track',
      duration: options?.duration || 120,
    }),
  });

  if (!res.ok) {
    throw new Error(`Suno API error: ${await res.text()}`);
  }

  const data = (await res.json()) as { audio_url?: string; url?: string };
  const audioUrl = data.audio_url || data.url;
  if (!audioUrl) {
    throw new Error('Suno returned no audio URL');
  }

  return {
    audioUrl,
    provider: 'suno',
    duration: options?.duration || 120,
  };
}

export async function generateVideoThumbnail(
  prompt: string
): Promise<{ imageUrl: string; provider: string }> {
  const token = getReplicateApiToken();
  if (!token) {
    if (isProduction()) {
      throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'REPLICATE_API_TOKEN fehlt für Video-Thumbnails');
    }
    throw new Error('REPLICATE_API_TOKEN nicht konfiguriert');
  }

  const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=90',
    },
    body: JSON.stringify({
      input: { prompt, num_outputs: 1, aspect_ratio: '16:9' },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Replicate video thumb error: ${await createRes.text()}`);
  }

  const prediction = (await createRes.json()) as {
    status: string;
    output?: string | string[];
    error?: string;
  };

  if (prediction.status === 'failed') {
    throw new Error(prediction.error || 'Video thumbnail failed');
  }

  const output = prediction.output;
  const imageUrl = Array.isArray(output) ? output[0] : output;
  if (!imageUrl) {
    throw new Error('No video thumbnail output');
  }

  return { imageUrl, provider: 'replicate-flux' };
}

export function requireImageProvider(): void {
  if (!hasImageAiProvider()) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Bild-Generierung benötigt OPENAI_API_KEY oder REPLICATE_API_TOKEN'
    );
  }
}

export type VideoAspectRatio = '16:9' | '9:16';

export async function generateVideo(
  prompt: string,
  options?: { aspectRatio?: VideoAspectRatio; duration?: number }
): Promise<{ videoUrl: string; provider: string }> {
  if (getRunwayApiKey()) {
    try {
      return await generateVideoWithRunway(prompt, options);
    } catch (err) {
      console.warn('[Media] Runway video failed:', err);
    }
  }

  if (getReplicateApiToken()) {
    try {
      return await generateVideoWithReplicate(prompt, options);
    } catch (err) {
      console.warn('[Media] Replicate video failed:', err);
    }
  }

  if (isProduction()) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Video-Generierung benötigt RUNWAY_API_KEY oder REPLICATE_API_TOKEN'
    );
  }

  throw new Error('Kein Video-Provider konfiguriert');
}

async function generateVideoWithReplicate(
  prompt: string,
  options?: { aspectRatio?: VideoAspectRatio; duration?: number }
): Promise<{ videoUrl: string; provider: string }> {
  const token = getReplicateApiToken()!;
  const model = getReplicateVideoModel();
  const aspectRatio = options?.aspectRatio === '9:16' ? '9:16' : '16:9';

  const createRes = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=180',
    },
    body: JSON.stringify({
      input: {
        prompt,
        prompt_optimizer: true,
        aspect_ratio: aspectRatio,
      },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Replicate video error: ${await createRes.text()}`);
  }

  let prediction = (await createRes.json()) as {
    id: string;
    status: string;
    output?: string | string[];
    error?: string;
  };

  let attempts = 0;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 120) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    prediction = await pollRes.json();
    attempts++;
  }

  if (prediction.status === 'failed') {
    throw new Error(prediction.error || 'Video generation failed');
  }

  const output = prediction.output;
  const videoUrl = Array.isArray(output) ? output[0] : output;
  if (!videoUrl || typeof videoUrl !== 'string') {
    throw new Error('No video output from Replicate');
  }

  return { videoUrl, provider: `replicate:${model}` };
}

async function generateVideoWithRunway(
  prompt: string,
  options?: { aspectRatio?: VideoAspectRatio; duration?: number }
): Promise<{ videoUrl: string; provider: string }> {
  const apiKey = getRunwayApiKey()!;
  const ratio = options?.aspectRatio === '9:16' ? '720:1280' : '1280:720';
  const duration = Math.min(Math.max(options?.duration ?? 5, 5), 10);

  const createRes = await fetch('https://api.dev.runwayml.com/v1/text_to_video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model: 'gen3a_turbo',
      promptText: prompt,
      duration,
      ratio,
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Runway video error: ${await createRes.text()}`);
  }

  const task = (await createRes.json()) as { id: string };
  let attempts = 0;

  while (attempts < 120) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
    });

    if (!pollRes.ok) {
      throw new Error(`Runway poll error: ${await pollRes.text()}`);
    }

    const result = (await pollRes.json()) as {
      status: string;
      output?: string[];
      failure?: string;
      failureCode?: string;
    };

    if (result.status === 'SUCCEEDED' && result.output?.[0]) {
      return { videoUrl: result.output[0], provider: 'runway-gen3a' };
    }

    if (result.status === 'FAILED') {
      throw new Error(result.failure || result.failureCode || 'Runway video failed');
    }

    attempts++;
  }

  throw new Error('Runway video timeout');
}
