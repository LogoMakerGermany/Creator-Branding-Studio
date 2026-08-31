import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { NexterPanel } from './NexterPanel';
import { useNexterStore } from '@/v2/store/nexter-store';

export function NexterStudioLayout({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  const setStudioHint = useNexterStore((s) => s.setStudioHint);
  useEffect(() => {
    setStudioHint(hint ?? null);
    return () => setStudioHint(null);
  }, [hint, setStudioHint]);

  return (
    <div className="flex min-h-0 flex-col gap-6 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="w-full shrink-0 xl:sticky xl:top-4 xl:h-[calc(100vh-8rem)] xl:w-[320px]">
        <NexterPanel compact className="h-full max-h-[70vh] xl:max-h-none" />
      </div>
    </div>
  );
}
