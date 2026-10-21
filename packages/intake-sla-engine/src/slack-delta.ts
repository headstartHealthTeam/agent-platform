import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';

export interface SlackDeltaRecord {
  readonly channelId?: unknown;
  readonly messageTs?: unknown;
}
interface DeltaEnvelope {
  readonly asOf: string;
  readonly scope: unknown;
  readonly identityHash?: unknown;
  readonly records?: unknown;
  readonly deletedKeys?: unknown;
}
export interface SlackMergedDelta extends DeltaEnvelope {
  readonly records: readonly SlackDeltaRecord[];
  readonly deletedKeys: readonly unknown[];
  readonly provenance: {
    readonly baseHash: string;
    readonly deltaHash: string;
    readonly proofHash: string;
  };
}
const envelopeSchema = z.looseObject({ asOf: z.string(), scope: z.unknown() });
const proofSchema = z.looseObject({
  version: z.literal(1),
  baseHash: z.string(),
  deltaHash: z.string(),
  scopeHash: z.string(),
  from: z.string(),
  to: z.string(),
  paginationComplete: z.literal(true),
  coversEdits: z.literal(true),
  coversDeletions: z.literal(true),
  identityHash: z.unknown().optional(),
});
function isEnvelope(value: unknown): value is DeltaEnvelope {
  return envelopeSchema.safeParse(value).success;
}
function records(value: unknown): value is SlackDeltaRecord[] {
  return z.array(z.looseObject({})).safeParse(value).success;
}
function key(record: SlackDeltaRecord): string {
  return `${String(record.channelId)}:${String(record.messageTs)}`;
}
export function mergeSlackDelta({
  base,
  delta,
  proof,
}: {
  readonly base: unknown;
  readonly delta: unknown;
  readonly proof: unknown;
}): SlackMergedDelta {
  const parsed = proofSchema.safeParse(proof);
  check(
    isEnvelope(base) &&
      isEnvelope(delta) &&
      parsed.success &&
      parsed.data.baseHash === sha256Json(base) &&
      parsed.data.deltaHash === sha256Json(delta) &&
      parsed.data.scopeHash === sha256Json(base.scope) &&
      sha256Json(base.scope) === sha256Json(delta.scope) &&
      parsed.data.from === base.asOf &&
      parsed.data.to === delta.asOf &&
      Date.parse(parsed.data.to) > Date.parse(parsed.data.from) &&
      parsed.data.identityHash === base.identityHash &&
      base.identityHash === delta.identityHash,
    'Slack incremental completeness is unproven; refresh this source'
  );
  check(
    records(base.records) && records(delta.records) && Array.isArray(delta.deletedKeys),
    'Invalid Slack delta'
  );
  const deletedKeys: readonly unknown[] = delta.deletedKeys;
  check(
    new Set(base.records.map(key)).size === base.records.length &&
      new Set(delta.records.map(key)).size === delta.records.length &&
      new Set(deletedKeys).size === deletedKeys.length,
    'Duplicate Slack delta identities'
  );
  const rows = new Map(base.records.map((record) => [key(record), record]));
  for (const deleted of deletedKeys) if (typeof deleted === 'string') rows.delete(deleted);
  for (const record of delta.records) {
    check(!deletedKeys.includes(key(record)), 'Conflicting Slack deletion/update');
    rows.set(key(record), record);
  }
  return {
    ...delta,
    deletedKeys,
    records: [...rows.values()].sort((left, right) => key(left).localeCompare(key(right))),
    provenance: {
      baseHash: parsed.data.baseHash,
      deltaHash: parsed.data.deltaHash,
      proofHash: sha256Json(proof),
    },
  };
}
