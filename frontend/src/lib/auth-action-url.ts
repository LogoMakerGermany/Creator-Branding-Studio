const AUTH_CONTINUE_PATHS = new Set(['/', '/login', '/verify-email']);

function normalizePathname(pathname: string): string {
  const path = pathname.trim().split('?')[0]?.split('#')[0] ?? '/';
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  return path;
}

/** Same-origin continue URLs only. Never accepts a client-supplied absolute URL. */
export function authActionContinueUrl(pathname: string): string {
  const path = AUTH_CONTINUE_PATHS.has(normalizePathname(pathname)) ? normalizePathname(pathname) : '/';
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function isAllowedAuthContinueUrl(url: string): boolean {
  try {
    const trimmed = url.trim();
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      return AUTH_CONTINUE_PATHS.has(normalizePathname(trimmed));
    }
    const parsed = new URL(trimmed);
    if (typeof window === 'undefined') return false;
    if (parsed.origin !== window.location.origin) return false;
    if (parsed.username || parsed.password) return false;
    return AUTH_CONTINUE_PATHS.has(parsed.pathname);
  } catch {
    return false;
  }
}
