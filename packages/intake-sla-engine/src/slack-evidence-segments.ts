import { slackDisplayText } from '@headstart-health/slack-data';

import {
  normalizedSlackEvidence as normalize,
  slackAnchorMatches,
  slackClientHeading,
  slackCompetingNames,
} from './slack-evidence-anchors.js';
import type { SlackEvidenceProfile, SlackTargetSegment } from './slack-evidence-types.js';

interface SelectionContext {
  readonly lines: readonly string[];
  readonly competitors: readonly string[];
  readonly targetName: string;
  readonly opportunityId: string;
}
function namesCompetitor(line: string, competitors: readonly string[]): boolean {
  const normalized = normalize(slackDisplayText(line));
  return competitors.some((name) => normalized.includes(name));
}
function otherIdentity(line: string, context: SelectionContext): boolean {
  return (
    namesCompetitor(line, context.competitors) ||
    (line.match(/\b006[A-Za-z0-9]{12,15}\b/g) ?? []).some(
      (id) => normalize(id) !== context.opportunityId
    )
  );
}
function selectThread(context: SelectionContext, anchor: number, selected: Set<number>): void {
  for (let index = anchor; index < context.lines.length; index++) {
    const line = context.lines.at(index) ?? '';
    if (index !== anchor && otherIdentity(line, context)) break;
    selected.add(index);
  }
}
function selectMultiClient(context: SelectionContext, anchor: number, selected: Set<number>): void {
  selected.add(anchor);
  for (let index = anchor + 1; index <= Math.min(context.lines.length - 1, anchor + 8); index++) {
    const raw = context.lines.at(index) ?? '';
    const line = slackDisplayText(raw);
    const normalized = normalize(line);
    if (
      namesCompetitor(raw, context.competitors) ||
      normalized.includes(context.targetName) ||
      (slackClientHeading(raw) && !normalized.includes(context.targetName))
    )
      break;
    if (
      /^reply \d+ of \d+/i.test(line) ||
      /^---\s*reply \d+ of \d+/i.test(line) ||
      /^\d+[.)]\s/.test(line)
    )
      break;
    selected.add(index);
  }
}
function selectWindow(context: SelectionContext, anchor: number, selected: Set<number>): void {
  for (
    let index = Math.max(0, anchor - 2);
    index <= Math.min(context.lines.length - 1, anchor + 4);
    index++
  ) {
    if (index !== anchor && otherIdentity(context.lines.at(index) ?? '', context)) {
      if (index > anchor) break;
      continue;
    }
    selected.add(index);
  }
}
export function slackTargetSegment(
  value: unknown,
  profile: SlackEvidenceProfile,
  threadScoped = false
): SlackTargetSegment {
  const targetName = normalize(profile.opportunityName);
  const opportunityId = normalize(profile.opportunityId);
  const lines = String(value)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const competitors = slackCompetingNames(profile);
  const anchors = slackAnchorMatches(lines, profile);
  if (!anchors.length) return { text: '', quality: 'Weak' };
  const multiClient =
    lines.some((line) => namesCompetitor(line, competitors)) ||
    lines.some(
      (line) => slackClientHeading(line) && !normalize(slackDisplayText(line)).includes(targetName)
    );
  const context = { lines, competitors, targetName, opportunityId };
  const selected = new Set<number>();
  for (const { index } of anchors) {
    if (threadScoped) selectThread(context, index, selected);
    else if (multiClient) selectMultiClient(context, index, selected);
    else selectWindow(context, index, selected);
  }
  const best = anchors.find((match) => match.quality === 'Direct') ?? anchors[0];
  return {
    text: [...selected]
      .sort((left, right) => left - right)
      .map((index) => lines.at(index))
      .join('\n'),
    quality: 'Weak',
    ...best,
  };
}
