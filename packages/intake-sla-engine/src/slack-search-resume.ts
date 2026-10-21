import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';

interface ResumePage {
  readonly opportunityId?: unknown;
  readonly query?: unknown;
  readonly pageNumber?: unknown;
  readonly requestCursor?: unknown;
}
export interface SlackResumeCapture {
  readonly version?: unknown;
  readonly runId?: unknown;
  readonly asOf?: unknown;
  readonly planHash?: unknown;
  readonly scopeHash?: unknown;
  readonly accessVerified?: unknown;
  readonly collectedAt: string;
  readonly pages: readonly ResumePage[];
}
const resumeSchema = z.looseObject({ collectedAt: z.string(), pages: z.array(z.looseObject({})) });
function isCapture(value: unknown): value is SlackResumeCapture {
  return resumeSchema.safeParse(value).success;
}
function pageKey(page: ResumePage): string {
  return `${String(page.opportunityId)}\0${String(page.query)}\0${String(page.pageNumber)}\0${String(page.requestCursor)}`;
}
export function extendSlackSearchCapture(previous: unknown, addition: unknown): SlackResumeCapture {
  check(
    isCapture(previous) &&
      isCapture(addition) &&
      previous.version === addition.version &&
      previous.runId === addition.runId &&
      previous.asOf === addition.asOf &&
      previous.planHash === addition.planHash &&
      previous.scopeHash === addition.scopeHash &&
      previous.accessVerified === addition.accessVerified &&
      Date.parse(addition.collectedAt) >= Date.parse(previous.collectedAt),
    'Slack resume bindings changed'
  );
  const pages = new Map(previous.pages.map((page) => [pageKey(page), page]));
  check(pages.size === previous.pages.length, 'Prior Slack capture has duplicate pages');
  for (const page of addition.pages) {
    const old = pages.get(pageKey(page));
    check(
      old === undefined || sha256Json(old) === sha256Json(page),
      'Slack resume cannot replace an existing raw page'
    );
    pages.set(pageKey(page), page);
  }
  return { ...previous, collectedAt: addition.collectedAt, pages: [...pages.values()] };
}
