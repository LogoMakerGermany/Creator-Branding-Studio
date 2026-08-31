import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/services/api';

const SLUGS = ['impressum', 'datenschutz', 'agb', 'widerruf', 'cookies'] as const;

export function LegalPage() {
  const { slug } = useParams<{ slug: string }>();
  const [title, setTitle] = useState('Rechtliches');
  const [html, setHtml] = useState('Lädt…');
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);

  useEffect(() => {
    if (!slug || !SLUGS.includes(slug as (typeof SLUGS)[number])) return;
    api.legal.page(slug as (typeof SLUGS)[number]).then((r) => {
      setTitle(r.title);
      setHtml(r.html);
      setNotice(r.notice ?? null);
      setDraft(Boolean(r.draft));
    });
  }, [slug]);

  return (
    <article className="mx-auto max-w-2xl space-y-4 p-8 text-zinc-200">
      <h1 className="font-display text-3xl font-bold text-white">{title}</h1>
      {draft && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          {notice || 'Entwurf / vor Veröffentlichung rechtlich prüfen lassen'}
        </p>
      )}
      <p className="leading-relaxed">{html}</p>
    </article>
  );
}
