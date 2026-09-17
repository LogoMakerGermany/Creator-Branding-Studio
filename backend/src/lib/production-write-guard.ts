import { isDevMode } from '../config/env.js';

export const PRODUCTION_FIREBASE_PROJECT_ID = 'nexter-creator-studio';

export function isIsolatedTestProcess(): boolean {
  return (
    Boolean(process.env.NODE_TEST) ||
    process.execArgv.includes('--test') ||
    process.argv.includes('--test') ||
    process.argv.some((arg) => /\.test\.[cm]?ts$/.test(String(arg).replace(/\\/g, '/')))
  );
}

/**
 * Fail-closed: automated tests may only mutate the isolated Dev Store.
 * Writing to production project nexter-creator-studio is never allowed from tests.
 */
export function assertNoProductionWritesFromTests(): void {
  if (!isIsolatedTestProcess()) return;
  if (isDevMode()) return;

  const project = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.PUBLIC_FIREBASE_PROJECT_ID ||
    ''
  ).trim();
  const hint = project ? ` (projectId=${project})` : '';
  throw new Error(
    `PRODUCTION_WRITE_GUARD: isolated tests must not write outside the Dev Store${hint}. ` +
      `Refusing writes targeting ${PRODUCTION_FIREBASE_PROJECT_ID}.`
  );
}
