import { getOpenAiApiKey, isProduction } from '../../config/env.js';
import { ServiceError } from '../../lib/errors.js';

export async function transcribeNexterAudio(audioBase64: string, mimeType: string): Promise<string> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new ServiceError(
      503,
      'VOICE_UNAVAILABLE',
      isProduction()
        ? 'Spracheingabe benötigt OPENAI_API_KEY (Whisper).'
        : 'Spracheingabe ist ohne OPENAI_API_KEY nicht verfügbar — nutze den Text-Chat.'
    );
  }

  const raw = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length < 64 || buffer.length > 4 * 1024 * 1024) {
    throw new ServiceError(400, 'AUDIO_INVALID', 'Audio zu klein oder zu groß');
  }

  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType || 'audio/webm' }), `clip.${ext}`);
  form.append('model', 'whisper-1');
  form.append('language', 'de');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new ServiceError(502, 'TRANSCRIPTION_FAILED', 'Sprache konnte nicht erkannt werden');
  }
  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new ServiceError(422, 'EMPTY_TRANSCRIPT', 'Nichts verstanden — bitte nochmal oder tippen.');
  return text;
}
