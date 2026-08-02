import { ServiceError } from './errors.js';
import { isProduction, getOpenAiApiKey } from '../config/env.js';
import type { SubtitleSegment } from './video-processing.js';
import { extractAudioFromVideo } from './video-processing.js';

export interface VideoAnalysisResult {
  highlights: Array<{ start: number; end: number; label: string; score: number }>;
  subtitles: SubtitleSegment[];
}

export async function transcribeVideoSource(sourceUrl: string): Promise<SubtitleSegment[]> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Untertitel benötigen OPENAI_API_KEY (Whisper)'
    );
  }

  const audioBuffer = await extractAudioFromVideo(sourceUrl);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    throw new ServiceError(502, 'TRANSCRIPTION_FAILED', `Whisper-Fehler: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  const segments = data.segments ?? [];
  if (!segments.length) {
    throw new ServiceError(422, 'NO_SPEECH', 'Keine Sprache im Video erkannt');
  }

  return segments.map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));
}

export async function detectHighlightsFromSubtitles(
  title: string,
  duration: number,
  subtitles: SubtitleSegment[],
  styleDirection?: string
): Promise<VideoAnalysisResult['highlights']> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'Highlight-Erkennung benötigt OPENAI_API_KEY');
  }

  const transcript = subtitles
    .map((s) => `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${s.text}`)
    .join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Du analysierst Video-Transkripte für Creator-Highlights. Antworte nur mit JSON: {"highlights":[{"start":number,"end":number,"label":string,"score":number}]}. 3 Highlights, Zeiten innerhalb der Videodauer, score 0-1.',
        },
        {
          role: 'user',
          content: `Video: "${title}", Dauer: ${duration}s, Stil: ${styleDirection || 'gaming'}.\nTranskript:\n${transcript}`,
        },
      ],
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    throw new ServiceError(502, 'HIGHLIGHT_ANALYSIS_FAILED', `OpenAI-Fehler: ${await res.text()}`);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const parsed = JSON.parse(data.choices[0]?.message?.content || '{}') as {
    highlights?: VideoAnalysisResult['highlights'];
  };

  if (!parsed.highlights?.length) {
    throw new ServiceError(422, 'NO_HIGHLIGHTS', 'Keine Highlights aus dem Transkript ableitbar');
  }

  return parsed.highlights.map((h) => ({
    ...h,
    start: Math.max(0, Math.min(h.start, duration)),
    end: Math.max(h.start + 1, Math.min(h.end, duration)),
  }));
}

export async function analyzeVideoFromSource(
  sourceUrl: string,
  title: string,
  duration: number,
  styleDirection?: string
): Promise<VideoAnalysisResult> {
  const subtitles = await transcribeVideoSource(sourceUrl);
  const highlights = await detectHighlightsFromSubtitles(title, duration, subtitles, styleDirection);
  return { highlights, subtitles };
}

export function requireVideoAnalysisConfigured(): void {
  if (!getOpenAiApiKey()) {
    if (isProduction()) {
      throw new ServiceError(
        503,
        'AI_NOT_CONFIGURED',
        'Video-Analyse benötigt OPENAI_API_KEY (Whisper + GPT)'
      );
    }
    throw new Error('OPENAI_API_KEY nicht konfiguriert');
  }
}
