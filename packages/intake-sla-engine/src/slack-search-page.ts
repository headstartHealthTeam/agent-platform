import {
  assertSlackSearchSuccess,
  normalizeSlackRenderedSearch,
  normalizeSlackSearchPageResponse,
  unwrapSlackSearchResponse,
} from '@headstart-health/slack-data';
import type { SlackIndividualReadback, SlackPageRecord } from '@headstart-health/slack-data';
import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';

export interface SlackCapturePage {
  readonly opportunityId?: unknown;
  readonly query: string;
  readonly requestCursor: string;
  readonly pageNumber: number;
  readonly complete: true;
  readonly response: unknown;
  readonly collectedAt?: string | undefined;
  readonly messageReadbacks?:
    readonly (SlackIndividualReadback & { readonly collectedAt: string })[] | undefined;
}
const pageSchema = z.looseObject({
  query: z.string(),
  requestCursor: z.string(),
  pageNumber: z.number().int().positive(),
  complete: z.literal(true),
  response: z.unknown(),
  collectedAt: z.string().optional(),
  messageReadbacks: z
    .array(
      z.looseObject({
        channelId: z.string(),
        messageTs: z.string(),
        response: z.unknown(),
        collectedAt: z.string(),
      })
    )
    .optional(),
});
export interface NormalizedSlackCapturePage {
  readonly query: string;
  readonly requestCursor: string;
  readonly pageNumber: number;
  readonly nextCursor: string;
  readonly terminal: boolean;
  readonly records: readonly SlackPageRecord[];
  readonly responseHash: string;
}
function assertPage(value: unknown): asserts value is SlackCapturePage {
  check(pageSchema.safeParse(value).success, 'Invalid Slack search page receipt');
}
export function normalizeSlackSearchPage(input: unknown): NormalizedSlackCapturePage {
  assertSlackSearchSuccess(input);
  let response = unwrapSlackSearchResponse(input['response']);
  assertPage(input);
  if (Object.hasOwn(response, 'results') || Object.hasOwn(response, 'pagination_info')) {
    for (const readback of input.messageReadbacks ?? []) {
      const collectedAt = Date.parse(input.collectedAt ?? '');
      check(
        Number.isFinite(collectedAt) &&
          Date.parse(readback.collectedAt) >= collectedAt &&
          Date.parse(readback.collectedAt) <= Date.now(),
        'Slack individual readback timestamp is not bound to its search capture'
      );
    }
    const rendered = normalizeSlackRenderedSearch(response, input.query, input.messageReadbacks);
    response = {
      ...rendered,
      records: rendered.records.map(({ individualReadback, originalSearchText, ...record }) =>
        individualReadback === undefined
          ? record
          : {
              ...record,
              individualReadbackHash: sha256Json(individualReadback),
              originalSearchText,
            }
      ),
    };
  }
  return {
    query: input.query,
    requestCursor: input.requestCursor,
    pageNumber: input.pageNumber,
    ...normalizeSlackSearchPageResponse(response, input.pageNumber),
    responseHash: sha256Json(input.response),
  };
}
