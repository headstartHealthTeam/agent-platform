import type { ActionDate, ActionMilestone } from './action-model-types.js';

export function actionModelText(value: unknown): string {
  const selected: unknown = [value].find(Boolean) ?? '';
  return String(selected).replace(/\s+/g, ' ').trim();
}

function easternDateParts(value: ActionDate): Map<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value ?? 0));
  return new Map(parts.map((part) => [part.type, part.value]));
}

export function actionIsoDate(value: ActionDate): string {
  const parts = easternDateParts(value);
  return `${String(parts.get('year'))}-${String(parts.get('month'))}-${String(parts.get('day'))}`;
}

function parseLooseDate(value: unknown, asOf: ActionDate): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$|^(\d{1,2})\/(\d{1,2})$/.exec(
    actionModelText(value)
  );
  if (!match) return '';
  const reference = easternDateParts(asOf);
  let year = match[3] ? Number(match[3]) : Number(reference.get('year'));
  if (year < 100) year += 2000;
  const date = new Date(
    Date.UTC(year, Number(match[1] ?? match[4]) - 1, Number(match[2] ?? match[5]), 12)
  );
  return Number.isNaN(date.getTime()) ? '' : actionIsoDate(date);
}

export function actionNextBusinessDay(value: ActionDate): string {
  const date = value instanceof Date ? new Date(value) : new Date(`${String(value)}T12:00:00Z`);
  do date.setUTCDate(date.getUTCDate() + 1);
  while ([0, 6].includes(date.getUTCDay()));
  return date.toISOString().slice(0, 10);
}

export function actionExplicitFollowUpDate(notes: unknown, asOf: ActionDate): string {
  const match =
    /(?:follow\s*up|f\/?u|check\s+back|reach\s+out)[^.;|]{0,80}?\b(?:on|by)\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\/\d{1,2})/i.exec(
      actionModelText(notes)
    );
  return match ? parseLooseDate(match[1], asOf) : '';
}

export function actionMilestoneDate(notes: unknown, asOf: ActionDate): ActionMilestone | null {
  const match =
    /\b(starting|start|anticipated\s+start\s+date|anticipated\s+start|scheduled\s+for|scheduled|submitted|submitting|submit|submission\s+date|submission)[^.;|]{0,50}?(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\/\d{1,2})/i.exec(
      actionModelText(notes)
    );
  if (!match) return null;
  return {
    kind: /submit/i.test(match[1] ?? '') ? 'submission' : 'event',
    date: parseLooseDate(match[2], asOf),
  };
}

export function actionOwnerFromText(action: string, fallback: string): string {
  const owner = /^(.+?)\s+to\s+/i.exec(actionModelText(action))?.[1] ?? '';
  return !owner || /\band\b/i.test(owner) ? fallback : owner;
}
