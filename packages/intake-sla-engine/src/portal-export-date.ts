import { requireContract as check } from './connector-checkpoint.js';

/** Interpret the Portal exporter's Eastern wall time; ambiguous DST times require its API timestamp. */
export function portalExportDate(text: string, timezone: unknown): string {
  check(timezone === 'America/New_York', 'CSV capture must attest the exporter timezone');
  const match =
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}),(\d{4}) (\d{1,2}):(\d{2}) (AM|PM)$/.exec(
      text
    );
  check(
    match !== null && Number(match[4]) >= 1 && Number(match[4]) <= 12 && Number(match[5]) < 60,
    'Invalid Portal export timestamp'
  );
  const month =
    'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').indexOf(match[1] ?? '') + 1;
  const hour = (Number(match[4]) % 12) + (match[6] === 'PM' ? 12 : 0);
  const year = Number(match[3]);
  const day = Number(match[2]);
  const minute = Number(match[5]);
  const target = [year, month, day, hour, minute];
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const possible = [4, 5]
    .map((offset) => Date.UTC(year, month - 1, day, hour + offset, minute))
    .filter((time) => {
      const parts = new Map(format.formatToParts(time).map((part) => [part.type, part.value]));
      return (['year', 'month', 'day', 'hour', 'minute'] as const).every(
        (key, index) => Number(parts.get(key)) === target.at(index)
      );
    });
  check(
    possible.length === 1,
    'Portal local timestamp is invalid or DST-ambiguous; use the API timestamp'
  );
  const timestamp = possible.at(0);
  check(timestamp !== undefined, 'Portal export timestamp is missing');
  return new Date(timestamp).toISOString();
}
