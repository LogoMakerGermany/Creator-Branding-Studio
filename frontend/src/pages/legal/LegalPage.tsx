import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LEGAL_PUBLIC_SLUGS, LEGAL_TEXT_STATUS } from '@ucbs/shared';
import { api } from '@/services/api';
import { LegalFooter } from '@/components/legal/LegalFooter';

type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'note'; text: string }
  | { type: 'links'; items: { href: string; label: string }[] };

function isLegalSlug(value: string | undefined): value is (typeof LEGAL_PUBLIC_SLUGS)[number] {
  return Boolean(value && (LEGAL_PUBLIC_SLUGS as readonly string[]).includes(value));
}

function LegalBlocks({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <div className="legal-prose space-y-4 text-sm leading-relaxed text-zinc-200 sm:text-base">
      {blocks.map((block, index) => {
        if (block.type === 'h2') {
          return (
            <h2 key={index} className="pt-2 font-display text-xl font-semibold text-white">
              {block.text}
            </h2>
          );
        }
        if (block.type === 'h3') {
          return (
            <h3 key={index} className="font-semibold text-white">
              {block.text}
            </h3>
          );
        }
        if (block.type === 'note') {
          return (
            <p key={index} className="text-zinc-400">
              {block.text}
            </p>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'links') {
          return (
            <p key={index} className="flex flex-wrap gap-x-4 gap-y-2">
              {block.items.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className="text-violet-300 underline decoration-violet-500/60 underline-offset-2 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </p>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}

export function LegalPage() {
  const { slug } = useParams<{ slug: string }>();
  const [title, setTitle] = useState('Rechtliches');
  const [html, setHtml] = useState('');
  const [blocks, setBlocks] = useState<LegalBlock[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const [documentVersion, setDocumentVersion] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const valid = isLegalSlug(slug);

  useEffect(() => {
    if (!valid) {
      setLoading(false);
      setError('Diese Rechtsseite existiert nicht.');
      document.title = 'Seite nicht gefunden — NEXTER Creator Studio';
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.legal
      .page(slug)
      .then((r) => {
        if (cancelled) return;
        setTitle(r.title);
        setHtml(r.html);
        setBlocks(Array.isArray(r.blocks) ? r.blocks : null);
        setNotice(r.notice ?? null);
        setDraft(r.publicationStatus ? r.publicationStatus !== 'published' : Boolean(r.draft) || r.status === LEGAL_TEXT_STATUS);
        setDocumentVersion(r.documentVersion ?? null);
        setLastUpdated(r.lastUpdated ?? null);
        document.title = r.seoTitle || `${r.title} (Entwurf) — NEXTER Creator Studio`;
        const desc = document.querySelector('meta[name="description"]');
        if (desc && r.seoDescription) desc.setAttribute('content', r.seoDescription);
      })
      .catch(() => {
        if (!cancelled) setError('Die Seite konnte nicht geladen werden.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, valid]);

  return (
    <article className="mx-auto max-w-2xl space-y-4 px-4 py-8 text-zinc-200 sm:px-6 print:max-w-none print:px-0 print:text-black">
      <style>{`@media print { nav, .legal-screen-only { display: none !important; } body { background: white; } }`}</style>
      <p className="legal-screen-only">
        <Link to="/" className="text-sm text-zinc-400 underline underline-offset-2 hover:text-white">
          Zur Startseite
        </Link>
      </p>
      <h1 className="font-display text-3xl font-bold text-white print:text-black">{title}</h1>
      {draft && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 print:border-black print:text-black">
          {notice || 'Entwurf / vor Veröffentlichung rechtlich prüfen lassen'}
        </p>
      )}
      {(documentVersion || lastUpdated) && (
        <p className="text-xs text-zinc-500">
          {documentVersion ? `Version ${documentVersion}` : null}
          {documentVersion && lastUpdated ? ' · ' : null}
          {lastUpdated ? `Stand ${lastUpdated}` : null}
        </p>
      )}
      {loading && (
        <p className="text-zinc-400" role="status">
          Lädt…
        </p>
      )}
      {error && (
        <p className="text-red-300" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && blocks && <LegalBlocks blocks={blocks} />}
      {!loading && !error && !blocks && html && <p className="leading-relaxed">{html}</p>}
      <div className="legal-screen-only border-t border-white/10 pt-4">
        <LegalFooter />
      </div>
    </article>
  );
}
