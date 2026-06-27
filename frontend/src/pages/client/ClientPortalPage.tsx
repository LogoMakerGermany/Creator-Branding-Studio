import { useEffect, useState } from 'react';
import { PageHeader, Badge, Button, Card, CardTitle } from '@/components/ui';
import { UserCheck, MessageSquare, Send } from 'lucide-react';
import { api, ApiError, type ClientProjectRecord } from '@/services/api';

const STATUS_LABELS: Record<ClientProjectRecord['status'], string> = {
  draft: 'Entwurf',
  in_progress: 'In Arbeit',
  review: 'Review',
  revision: 'Revision',
  completed: 'Abgeschlossen',
};

export function ClientPortalPage() {
  const [projects, setProjects] = useState<ClientProjectRecord[]>([]);
  const [selected, setSelected] = useState<ClientProjectRecord | null>(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.clientPortal.list().then((res) => {
      setProjects(res.projects);
      if (res.projects[0]) setSelected(res.projects[0]);
    }).catch(() => {});
  }, []);

  async function handleFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !feedback.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.clientPortal.feedback(selected.id, feedback.trim());
      setSelected(res.project);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setFeedback('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Kundenportal"
        description="Projekte verfolgen, Feedback geben und Aufträge einsehen"
        badge={<Badge variant="brand">UCBS</Badge>}
      />

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}

      {projects.length === 0 ? (
        <Card>
          <div className="flex items-center gap-3 text-zinc-400">
            <UserCheck className="h-5 w-5" />
            <p className="text-sm">
              Keine Projekte verknüpft. In der Agenturverwaltung einen Kunden mit Portal-Zugang anlegen und ein Projekt erstellen.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardTitle>Meine Projekte</CardTitle>
            <div className="mt-4 space-y-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelected(project)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    selected?.id === project.id
                      ? 'border-brand-500/40 bg-brand-500/10'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <p className="font-medium text-zinc-200">{project.title}</p>
                  <Badge variant="default" className="mt-1">{STATUS_LABELS[project.status]}</Badge>
                </button>
              ))}
            </div>
          </Card>

          {selected && (
            <Card className="lg:col-span-2">
              <CardTitle>{selected.title}</CardTitle>
              <p className="mt-1 text-sm text-zinc-500">{selected.description ?? 'Branding-Projekt'}</p>
              <Badge variant="brand" className="mt-2">{STATUS_LABELS[selected.status]}</Badge>

              {selected.feedback.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
                    <MessageSquare className="h-4 w-4" />
                    Feedback-Verlauf
                  </p>
                  <div className="space-y-2">
                    {selected.feedback.map((fb) => (
                      <div key={fb.id} className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-400">
                        {fb.message}
                        <p className="mt-1 text-xs text-zinc-600">
                          {new Date(fb.createdAt).toLocaleString('de-DE')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleFeedback} className="mt-6">
                <textarea
                  className="w-full rounded-lg border border-zinc-800 bg-surface-900 p-3 text-sm text-zinc-200"
                  rows={3}
                  placeholder="Feedback oder Änderungswünsche..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
                <Button type="submit" loading={loading} className="mt-2 gap-2">
                  <Send className="h-4 w-4" />
                  Feedback senden
                </Button>
              </form>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
