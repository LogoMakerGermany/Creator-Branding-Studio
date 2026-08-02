import {
  isProduction,
  collectProductionConfigIssues,
} from './env.js';

/**
 * Fail fast in production if secrets or security settings are misconfigured.
 * All server secrets must live in Railway Variables — never in the frontend or git.
 * Returns true when configuration is valid (or when not in production).
 */
export function validateProductionConfig(): boolean {
  if (!isProduction()) {
    return true;
  }

  const issues = collectProductionConfigIssues();

  if (issues.length === 0) {
    return true;
  }

  console.error('[Config] Production configuration incomplete — refusing to start:');
  for (const issue of issues) {
    console.error(`  - ${issue.variable}: ${issue.message}`);
  }
  console.error(
    '[Config] Set these as Railway Project Variables (same names for local development).'
  );
  return false;
}

/** Validate and exit the process if production config is invalid. */
export function assertProductionConfigOrExit(): void {
  if (!validateProductionConfig()) {
    process.exit(1);
  }
}
