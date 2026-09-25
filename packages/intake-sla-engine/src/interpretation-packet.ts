import type { EvidenceDate } from './evidence.js';
import type { GateContext } from './gate-context.js';

export type InterpretationJson =
  | string
  | number
  | boolean
  | null
  | readonly InterpretationJson[]
  | { readonly [key: string]: InterpretationJson | undefined };

type NamedIdentity = { readonly name?: unknown } | Readonly<Record<string, unknown>>;
export interface InterpretationProfile {
  readonly opportunityId?: string | null | undefined;
  readonly opportunityName?: string | null | undefined;
  readonly knownNameVariants?: readonly string[] | null | undefined;
  readonly clientAliases?: readonly string[] | null | undefined;
  readonly practice?: string | NamedIdentity | null | undefined;
  readonly providerRoles?:
    | readonly {
        readonly role: string;
        readonly names?: readonly string[] | null | undefined;
        readonly emails?: readonly string[] | null | undefined;
      }[]
    | null
    | undefined;
  readonly currentCsm?: string | NamedIdentity | null | undefined;
  readonly priorCsms?: readonly unknown[] | null | undefined;
  readonly authorizationNumbers?: readonly string[] | null | undefined;
  readonly payers?: readonly InterpretationJson[] | null | undefined;
  readonly rbtRequests?: readonly InterpretationJson[] | null | undefined;
  readonly candidates?: readonly InterpretationJson[] | null | undefined;
  readonly providerRoster?:
    | readonly {
        readonly opportunityId?: string | null | undefined;
        readonly id?: string | null | undefined;
        readonly opportunityName?: string | null | undefined;
        readonly name?: string | null | undefined;
      }[]
    | null
    | undefined;
  readonly stage?: string | null | undefined;
  readonly stageEntryDate?: string | null | undefined;
}
export interface InterpretationPacketInput {
  readonly profile?: InterpretationProfile | null;
  readonly gate?: GateContext | null;
  readonly source?: string;
  readonly sourceRecordId?: string;
  readonly eventDate?: EvidenceDate | null | undefined;
  readonly segment?: string | null;
  readonly matchQuality?: string;
  readonly matchContext?: Readonly<Record<string, InterpretationJson | undefined>>;
}

export function compactInterpretationText(value: string | null | undefined = ''): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}
function identityName(value: string | NamedIdentity | null | undefined): unknown {
  return (typeof value === 'object' ? value?.name : undefined) ?? value ?? null;
}
export interface TranscriptInterpretationPacket {
  readonly opportunity: {
    readonly id: string | null;
    readonly name: string | null;
    readonly aliases: readonly string[];
    readonly practice: unknown;
    readonly providerRoles: readonly {
      readonly role: string;
      readonly names: readonly string[];
      readonly emails: readonly string[];
    }[];
    readonly currentCsm: unknown;
    readonly priorCsms: readonly unknown[];
    readonly authorizationNumbers: readonly string[];
    readonly payers: readonly InterpretationJson[];
    readonly rbtRequests: readonly InterpretationJson[];
    readonly candidates: readonly InterpretationJson[];
    readonly providerRoster: readonly {
      readonly opportunityId: string | null;
      readonly opportunityName: string | null;
    }[];
  };
  readonly process: {
    readonly stage: string | null;
    readonly processPosition: string | null;
    readonly unresolvedGate: string | null;
    readonly gateCategory: string | null;
    readonly stageEntryDate: string | null;
  };
  readonly source: {
    readonly name: string | undefined;
    readonly recordId: string | undefined;
    readonly eventDate: EvidenceDate | null | undefined;
    readonly matchQuality: string | undefined;
    readonly matchContext: Readonly<Record<string, InterpretationJson | undefined>>;
  };
  readonly transcriptSegment: string;
}
/** Fields consumed when validating findings from an already prepared packet; other fields remain hash-bound. */
export interface PreparedInterpretationPacket {
  readonly transcriptSegment?: string | null | undefined;
  readonly opportunity?: { readonly id?: string | null | undefined } | null | undefined;
  readonly source?:
    | {
        readonly matchQuality?: string | null | undefined;
        readonly eventDate?: EvidenceDate | null | undefined;
      }
    | null
    | undefined;
}
export function buildTranscriptInterpretationPacket(
  input: InterpretationPacketInput
): TranscriptInterpretationPacket {
  const { profile, gate } = input;
  return {
    opportunity: {
      id: profile?.opportunityId ?? null,
      name: profile?.opportunityName ?? null,
      aliases: profile?.knownNameVariants ?? profile?.clientAliases ?? [],
      practice: identityName(profile?.practice),
      providerRoles: (profile?.providerRoles ?? []).map((provider) => ({
        role: provider.role,
        names: provider.names ?? [],
        emails: provider.emails ?? [],
      })),
      currentCsm: identityName(profile?.currentCsm),
      priorCsms: profile?.priorCsms ?? [],
      authorizationNumbers: profile?.authorizationNumbers ?? [],
      payers: profile?.payers ?? [],
      rbtRequests: profile?.rbtRequests ?? [],
      candidates: profile?.candidates ?? [],
      providerRoster: (profile?.providerRoster ?? []).map((record) => ({
        opportunityId: record.opportunityId ?? record.id ?? null,
        opportunityName: record.opportunityName ?? record.name ?? null,
      })),
    },
    process: {
      stage: profile?.stage ?? null,
      processPosition: gate?.processPosition ?? profile?.stage ?? null,
      unresolvedGate: gate?.unresolvedGate ?? null,
      gateCategory: gate?.gateCategory ?? null,
      stageEntryDate: profile?.stageEntryDate ?? null,
    },
    source: {
      name: input.source,
      recordId: input.sourceRecordId,
      eventDate: input.eventDate,
      matchQuality: input.matchQuality,
      matchContext: input.matchContext ?? {},
    },
    transcriptSegment: compactInterpretationText(input.segment).slice(0, 16000),
  };
}

export function interpretationGateContext({
  stage = '',
  authorizationGate = null,
}: {
  readonly stage?: string | null | undefined;
  readonly authorizationGate?: {
    readonly required?: boolean;
    readonly satisfied?: boolean;
    readonly blocker?: string | null;
  } | null;
} = {}): {
  readonly processPosition: string | null;
  readonly unresolvedGate: string | null | undefined;
} {
  return {
    processPosition: stage,
    unresolvedGate:
      authorizationGate?.required && !authorizationGate.satisfied
        ? authorizationGate.blocker
        : stage,
  };
}
