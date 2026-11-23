/** Browserless Cloud may route its returned Live URL through an opaque /e/<route> prefix. */
export function isBrowserlessViewerPath(path: string): boolean {
  if (path === '/live/index.html') return true;
  const parts = path.split('/');
  return (
    parts.length === 5 &&
    parts[0] === '' &&
    parts[1] === 'e' &&
    /^[A-Za-z0-9_-]{1,2048}$/.test(parts[2] ?? '') &&
    parts[3] === 'live' &&
    parts[4] === 'index.html'
  );
}

/** A provider token must never be conveyed in the returned viewer capability. */
export function containsViewerToken(raw: string, url: URL, token: string): boolean {
  return (
    raw.includes(token) ||
    url.href.includes(token) ||
    [...url.searchParams].some(([key, value]) => key.includes(token) || value.includes(token))
  );
}
