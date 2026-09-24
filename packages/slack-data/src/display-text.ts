/** Project Slack markup without changing the original capture or establishing message relevance. */
export function slackDisplayText(value: unknown = ''): string {
  return String(value)
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/g, '$1')
    .replace(/<@[^|>]+\|([^>]+)>/g, '$1')
    .replace(/:[a-z0-9_+-]+:/gi, ' ')
    .replace(/\*|_/g, '')
    .replace(/&gt;/g, '>')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
/** A supported ISO value or the last native EDT/EST display stamp; no date/completion inference. */
export function slackDisplayTimestamp(value: unknown): string | null {
  const isoParts =
    typeof value === 'string'
      ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(.*)(Z|[+-]\d{2}:\d{2})$/.exec(value)
      : null;
  if (
    typeof value === 'string' &&
    isoParts &&
    (isoParts[2] === '' || /^\.\d+$/.test(isoParts[2] ?? '')) &&
    Number.isFinite(Date.parse(value))
  )
    return new Date(value).toISOString();
  const match = [
    ...String(value).matchAll(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(EDT|EST)/g),
  ].at(-1);
  if (!match) return null;
  return `${match[1] ?? ''}T${match[2] ?? ''}${match[3] === 'EDT' ? '-04:00' : '-05:00'}`;
}
