import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.setState({ failed: true });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-950 p-6 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Etwas ist schiefgelaufen — NEXTER</h1>
        <p className="max-w-md text-sm text-zinc-400" role="alert">
          Die Oberfläche konnte nicht geladen werden. Es werden keine technischen Details angezeigt. Bitte neu laden
          oder zur Startseite zurück.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="min-h-11 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white"
            onClick={() => window.location.reload()}
          >
            Neu laden
          </button>
          <a
            href={`/support?type=bug&route=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200"
          >
            Problem melden
          </a>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200"
          >
            Zur Startseite
          </a>
        </div>
      </div>
    );
  }
}
