import { interpretationBindingForPacket } from './ai-interpretation.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import {
  APPROVED_INTERPRETER_PROVIDER,
  interpretationBindingDiff,
} from './interpretation-binding.js';
import type { InterpretationBinding } from './interpretation-binding.js';
import type { TranscriptInterpretationPacket } from './interpretation-packet.js';

const REUSE_EXACT = 'reuse-exact';

export interface InterpretationEnvelope<
  TPacket = TranscriptInterpretationPacket,
  TMeeting = string | undefined,
> {
  readonly opportunityId: string;
  readonly sourceRecordId: string;
  readonly meetingId?: TMeeting;
  readonly packet: TPacket;
}
export interface SavedInterpretation<TMeeting = string | undefined> {
  readonly opportunityId?: string;
  readonly sourceRecordId: string;
  readonly meetingId?: TMeeting;
  readonly binding?: unknown;
}
export interface InterpretationArtifact<T extends SavedInterpretation<unknown>> {
  readonly apiEnabled?: unknown;
  readonly currentRunPrecomputed?: unknown;
  readonly provider?: unknown;
  readonly model?: unknown;
  readonly engineVersion?: unknown;
  readonly store?: unknown;
  readonly rows?:
    | readonly {
        readonly opportunityId?: unknown;
        readonly interpretations?: readonly T[] | null;
      }[]
    | null;
}
export interface InterpretationDeltaInput<
  T extends SavedInterpretation<unknown>,
  TPacket = TranscriptInterpretationPacket,
  TMeeting = string | undefined,
> {
  readonly currentPackets: {
    readonly packets?: readonly InterpretationEnvelope<TPacket, TMeeting>[] | null;
  };
  readonly priorPackets?: {
    readonly packets?: readonly InterpretationEnvelope<unknown, unknown>[] | null;
  };
  readonly priorInterpretations?: InterpretationArtifact<T>;
  readonly checkpoint?: {
    readonly interpretations?: readonly (T & { readonly opportunityId: string })[] | null;
  };
  readonly model: string;
  readonly provider?: string;
  readonly engineVersion?: string;
}
interface DeltaItemBase<TPacket, TMeeting> {
  readonly key: string;
  readonly envelope: InterpretationEnvelope<TPacket, TMeeting>;
  readonly binding: InterpretationBinding;
}
export type InterpretationDeltaItem<
  T extends SavedInterpretation<unknown>,
  TPacket = TranscriptInterpretationPacket,
  TMeeting = string | undefined,
> = DeltaItemBase<TPacket, TMeeting> &
  (
    | { readonly mode: 'resume' | typeof REUSE_EXACT; readonly interpretation: T }
    | {
        readonly mode: 'fresh';
        readonly reason:
          | 'prior-execution-not-reusable'
          | 'packet-changed'
          | 'prior-binding-invalid'
          | 'new-packet';
      }
  );
export interface InterpretationDeltaPlan<
  T extends SavedInterpretation<unknown>,
  TPacket = TranscriptInterpretationPacket,
  TMeeting = string | undefined,
> {
  readonly items: readonly InterpretationDeltaItem<T, TPacket, TMeeting>[];
  readonly counts: {
    readonly total: number;
    readonly [REUSE_EXACT]: number;
    readonly resume: number;
    readonly fresh: number;
  };
}
export function interpretationKey(opportunityId: string, sourceRecordId: string): string {
  return `${opportunityId}\u0000${sourceRecordId}`;
}
function indexed<T>(
  items: readonly T[],
  keyFor: (item: T) => string,
  label: string
): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    const key = keyFor(item);
    if (index.has(key)) throw new Error(`${label} contains duplicate packet identity ${key}`);
    index.set(key, item);
  }
  return index;
}
function interpretationIndex<T extends SavedInterpretation<unknown>>(
  artifact: InterpretationArtifact<T>
): Map<string, T> {
  const index = new Map<string, T>();
  for (const row of artifact.rows ?? []) {
    for (const interpretation of row.interpretations ?? []) {
      if (typeof row.opportunityId !== 'string')
        throw new Error('Invalid prior interpretation Opportunity identity');
      const key = interpretationKey(row.opportunityId, interpretation.sourceRecordId);
      if (index.has(key))
        throw new Error(`Prior interpretation artifact contains duplicate packet identity ${key}`);
      index.set(key, interpretation);
    }
  }
  return index;
}
function executionReusable<T extends SavedInterpretation<unknown>>(
  artifact: InterpretationArtifact<T>,
  model: string,
  provider: string,
  engineVersion: string
): boolean {
  return (
    artifact.apiEnabled === true &&
    artifact.currentRunPrecomputed !== true &&
    artifact.provider === provider &&
    artifact.model === model &&
    artifact.engineVersion === engineVersion &&
    artifact.store === false
  );
}
function priorItem<T extends SavedInterpretation<unknown>, TPacket, TMeeting>(
  base: DeltaItemBase<TPacket, TMeeting>,
  priorPacket: InterpretationEnvelope<unknown, unknown> | undefined,
  interpretation: T | undefined,
  reusable: boolean,
  model: string,
  provider: string,
  engineVersion: string
): InterpretationDeltaItem<T, TPacket, TMeeting> {
  if (priorPacket === undefined || interpretation === undefined)
    return { ...base, mode: 'fresh', reason: 'new-packet' };
  if (!reusable) return { ...base, mode: 'fresh', reason: 'prior-execution-not-reusable' };
  const priorBinding = interpretationBindingForPacket({
    packet: priorPacket.packet,
    model,
    provider,
    engineVersion,
  });
  const priorIsBound = interpretationBindingDiff(priorBinding, interpretation.binding).length === 0;
  if (priorIsBound && priorBinding.bindingHash === base.binding.bindingHash)
    return { ...base, mode: REUSE_EXACT, interpretation };
  return {
    ...base,
    mode: 'fresh',
    reason: priorIsBound ? 'packet-changed' : 'prior-binding-invalid',
  };
}
export function planInterpretationDelta<
  T extends SavedInterpretation<unknown>,
  TPacket = TranscriptInterpretationPacket,
  TMeeting = string | undefined,
>({
  currentPackets,
  priorPackets = {},
  priorInterpretations = {},
  checkpoint = {},
  model,
  provider = APPROVED_INTERPRETER_PROVIDER,
  engineVersion = EVIDENCE_ENGINE_VERSION,
}: InterpretationDeltaInput<T, TPacket, TMeeting>): InterpretationDeltaPlan<T, TPacket, TMeeting> {
  const envelopeKey = (item: InterpretationEnvelope<unknown, unknown>): string =>
    interpretationKey(item.opportunityId, item.sourceRecordId);
  const current = indexed(currentPackets.packets ?? [], envelopeKey, 'Current packet artifact');
  const prior = indexed(priorPackets.packets ?? [], envelopeKey, 'Prior packet artifact');
  const interpretations = interpretationIndex(priorInterpretations);
  const reusable = executionReusable(priorInterpretations, model, provider, engineVersion);
  const checkpoints = indexed(
    checkpoint.interpretations ?? [],
    (item) => interpretationKey(item.opportunityId, item.sourceRecordId),
    'Checkpoint'
  );
  const items = [...current.values()].map(
    (envelope): InterpretationDeltaItem<T, TPacket, TMeeting> => {
      const key = envelopeKey(envelope);
      const binding = interpretationBindingForPacket({
        packet: envelope.packet,
        model,
        provider,
        engineVersion,
      });
      const base = { key, envelope, binding };
      const saved = checkpoints.get(key);
      if (saved !== undefined && interpretationBindingDiff(binding, saved.binding).length === 0)
        return { ...base, mode: 'resume', interpretation: saved };
      return priorItem(
        base,
        prior.get(key),
        interpretations.get(key),
        reusable,
        model,
        provider,
        engineVersion
      );
    }
  );
  return {
    items,
    counts: {
      total: items.length,
      [REUSE_EXACT]: items.filter((item) => item.mode === REUSE_EXACT).length,
      resume: items.filter((item) => item.mode === 'resume').length,
      fresh: items.filter((item) => item.mode === 'fresh').length,
    },
  };
}
export interface CompletedInterpretationItem<
  T extends SavedInterpretation<unknown>,
  TMeeting = string | undefined,
> {
  readonly key: string;
  readonly envelope: InterpretationEnvelope<unknown, TMeeting>;
  readonly interpretation?: T;
}
type GroupedInterpretation<T extends SavedInterpretation<unknown>, TMeeting> = Omit<
  T,
  'opportunityId' | 'sourceRecordId' | 'meetingId'
> & {
  readonly sourceRecordId: string;
  readonly meetingId: TMeeting | undefined;
};
export interface OpportunityInterpretations<
  T extends SavedInterpretation<unknown>,
  TMeeting = string | undefined,
> {
  readonly opportunityId: string;
  readonly enabled: true;
  readonly mode: 'precomputed';
  readonly interpretations: readonly GroupedInterpretation<T, TMeeting>[];
}
function groupedInterpretation<T extends SavedInterpretation<unknown>, TMeeting>(
  {
    opportunityId: _opportunityId,
    sourceRecordId: _sourceRecordId,
    meetingId: _meetingId,
    ...interpretation
  }: T,
  envelope: InterpretationEnvelope<unknown, TMeeting>
): GroupedInterpretation<T, TMeeting> {
  return {
    ...interpretation,
    sourceRecordId: envelope.sourceRecordId,
    meetingId: envelope.meetingId,
  };
}
export function groupInterpretationsByOpportunity<
  T extends SavedInterpretation<unknown>,
  TMeeting = string | undefined,
>(
  items: readonly CompletedInterpretationItem<T, TMeeting>[] = []
): OpportunityInterpretations<T, TMeeting>[] {
  const rows = new Map<string, GroupedInterpretation<T, TMeeting>[]>();
  for (const item of items) {
    if (item.interpretation === undefined)
      throw new Error(`Interpretation is missing for ${item.key}`);
    const opportunityId = item.envelope.opportunityId;
    const interpretations = rows.get(opportunityId) ?? [];
    interpretations.push(groupedInterpretation(item.interpretation, item.envelope));
    rows.set(opportunityId, interpretations);
  }
  return [...rows.entries()].map(([opportunityId, interpretations]) => ({
    opportunityId,
    enabled: true,
    mode: 'precomputed',
    interpretations,
  }));
}
