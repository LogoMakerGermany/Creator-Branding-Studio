import { useEffect, useState } from 'react';
import {
  PageHeader, Badge, Button, Card, CardTitle, Input, StatCard,
} from '@/components/ui';
import { Briefcase, Plus, Users, FolderKanban } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  api, ApiError,
  type AgencyClientRecord, type ClientProjectRecord, type AgencyManagementOverview,
} from '@/services/api';

const STATUS_LABELS: Record<ClientProjectRecord['status'], string> = {
  draft: 'Entwurf',
  in_progress: 'In Arbeit',
  review: 'Review',
  revision: 'Revision',
  completed: 'Abgeschlossen',
};

export function AgencyManagementPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<AgencyManagementOverview | null>(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await api.agencyManagement.overview();
    setOverview(res);
    if (res.clients[0]) setSelectedClientId(res.clients[0].id);
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!overview?.agency) {
      setError('Erstelle zuerst eine Agentur unter Agentur DNA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.agencyManagement.createClient({
        agencyId: overview.agency.id,
        name: clientName,
        email: clientEmail,
        portalUserId: user?.id,
      });
      setClientName('');
      setClientEmail('');
      setShowClientForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!overview?.agency || !selectedClientId) return;
    setLoading(true);
    try {
      await api.agencyManagement.createProject({
        agencyId: overview.agency.id,
        clientId: selectedClientId,
        title: projectTitle,
      });
      setProjectTitle('');
      setShowProjectForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(project: ClientProjectRecord, status: ClientProjectRecord['status']) {
    if (!overview?.agency) return;
    await api.agencyManagement.updateProjectStatus(project.id, overview.agency.id, status);
    await load();
  }

  const agency = overview?.agency;

  return (
    <div>
      <PageHeader
        title="Agenturverwaltung"
        description="Mitarbeiter, Kunden, Projekte und Aufträge verwalten"
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={
          agency ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowClientForm(true)} className="gap-1">
                <Plus className="h-3 w-3" /> Kunde
              </Button>
              <Button size="sm" onClick={() => setShowProjectForm(true)} className="gap-1">
                <Plus className="h-3 w-3" /> Projekt
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}

      {!agency ? (
        <Card>
          <p className="text-sm text-zinc-400">
            Noch keine Agentur vorhanden. Erstelle zuerst eine Agentur unter{' '}
            <a href="/agency-dna" className="text-brand-400 hover:underline">Agentur DNA</a>.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <StatCard label="Agentur" value={agency.name} icon={<Briefcase className="h-5 w-5" />} />
            <StatCard label="Kunden" value={overview.clients.length} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Projekte" value={overview.projects.length} icon={<FolderKanban className="h-5 w-5" />} />
            <StatCard label="Team" value={overview.members.length} />
          </div>

          {showClientForm && (
            <Card className="mb-6">
              <CardTitle>Neuer Kunde</CardTitle>
              <form onSubmit={handleCreateClient} className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input placeholder="Name" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
                <Input type="email" placeholder="E-Mail" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required />
                <Button type="submit" loading={loading}>Kunde anlegen</Button>
              </form>
              <p className="mt-2 text-xs text-zinc-500">Portal-Zugang wird automatisch mit deinem Account verknüpft (Dev-Modus).</p>
            </Card>
          )}

          {showProjectForm && (
            <Card className="mb-6">
              <CardTitle>Neues Projekt</CardTitle>
              <form onSubmit={handleCreateProject} className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input placeholder="Projekttitel" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} required />
                <select
                  className="rounded-lg border border-zinc-800 bg-surface-900 px-3 py-2 text-sm text-zinc-200"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  {overview.clients.map((c: AgencyClientRecord) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button type="submit" loading={loading} disabled={overview.clients.length === 0}>Projekt erstellen</Button>
              </form>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle>Kunden</CardTitle>
              <div className="mt-4 space-y-2">
                {overview.clients.map((client) => (
                  <div key={client.id} className="rounded-lg border border-zinc-800 p-3">
                    <p className="font-medium text-zinc-200">{client.name}</p>
                    <p className="text-xs text-zinc-500">{client.email}</p>
                  </div>
                ))}
                {overview.clients.length === 0 && <p className="text-sm text-zinc-500">Noch keine Kunden</p>}
              </div>
            </Card>

            <Card>
              <CardTitle>Projekte</CardTitle>
              <div className="mt-4 space-y-2">
                {overview.projects.map((project) => (
                  <div key={project.id} className="rounded-lg border border-zinc-800 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-zinc-200">{project.title}</p>
                      <Badge variant="default">{STATUS_LABELS[project.status]}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(['in_progress', 'review', 'completed'] as const).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant="outline"
                          disabled={project.status === s}
                          onClick={() => handleStatusChange(project, s)}
                        >
                          {STATUS_LABELS[s]}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                {overview.projects.length === 0 && <p className="text-sm text-zinc-500">Noch keine Projekte</p>}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
