import type { StudioProjectSummary } from '@/services/api';

interface StudioHistoryProps {
  projects: StudioProjectSummary[];
  onSelect?: (project: StudioProjectSummary) => void;
}

export function StudioHistory({ projects, onSelect }: StudioHistoryProps) {
  if (!projects.length) return null;

  return (
    <div className="ucbs-neon-card mt-6 p-4">
      <p className="mb-3 text-sm font-medium text-zinc-200">Verlauf</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {projects.slice(0, 12).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect?.(p)}
            className="overflow-hidden rounded-lg border border-zinc-800 text-left transition-colors hover:border-zinc-600"
          >
            {p.imageUrl ? (
              <img src={p.imageUrl} alt="" className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-zinc-900 text-xs text-zinc-500">
                {p.status}
              </div>
            )}
            <p className="truncate px-1 py-1 text-[10px] text-zinc-500">
              {p.provider ?? p.status}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
