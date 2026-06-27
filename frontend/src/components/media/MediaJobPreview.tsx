import type { MediaJob } from '@/services/api';

interface MediaJobPreviewProps {
  job: MediaJob | null;
  emptyLabel?: string;
  className?: string;
}

export function MediaJobPreview({
  job,
  emptyLabel = 'Noch nichts generiert',
  className = 'aspect-video',
}: MediaJobPreviewProps) {
  if (!job) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }

  if (job.videoUrl) {
    return (
      <video
        src={job.videoUrl}
        controls
        className={`h-full w-full object-contain ${className}`}
        poster={job.thumbnailUrl || job.imageUrl}
      />
    );
  }

  if (job.audioUrl) {
    return (
      <div className="flex w-full flex-col items-center gap-4 p-6">
        <audio src={job.audioUrl} controls className="w-full" />
        {typeof job.metadata?.transcript === 'string' && (
          <p className="text-center text-sm text-zinc-400">{job.metadata.transcript}</p>
        )}
      </div>
    );
  }

  const imageUrl = job.thumbnailUrl || job.imageUrl;
  if (imageUrl) {
    return <img src={imageUrl} alt={job.title ?? 'Preview'} className="h-full w-full object-contain" />;
  }

  return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
}

export function getMediaDownloadUrl(job: MediaJob | null): string | null {
  if (!job) return null;
  return job.videoUrl || job.audioUrl || job.thumbnailUrl || job.imageUrl || null;
}
