import type { Server } from 'node:http';

let acceptingWork = true;
let httpServer: Server | null = null;
let shuttingDown = false;

export function isAcceptingWork(): boolean {
  return acceptingWork;
}

export function setAcceptingWork(value: boolean): void {
  acceptingWork = value;
}

export function setHttpServer(server: Server): void {
  httpServer = server;
}

export function setupGracefulShutdown(): void {
  const onSignal = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    acceptingWork = false;
    console.info(`[shutdown] ${signal} — no new billable jobs; closing HTTP server`);
    const force = setTimeout(() => {
      console.error('[shutdown] timeout — exiting');
      process.exit(1);
    }, 25_000);
    force.unref();
    if (!httpServer) {
      process.exit(0);
      return;
    }
    httpServer.close((err) => {
      if (err) {
        console.error('[shutdown] server close error:', err.message);
        process.exit(1);
        return;
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}
