import type { GateContext } from './gate-context.js';

export type InterpretationJson =
  | string
  | number
  | boolean
  | null
  | readonly InterpretationJson[]
  | { readonly [key: string]: InterpretationJson | undefined };

interface NamedIdentity {
  readonly name?: string | null;
  readonly [key: string]: InterpretationJson | undefined;
}
export interface InterpretationProfile {
  readonly opportunityId?: string | null;
  readonly opportunityName?: string | null;
  readonly knownNameVariants?: readonly string[] | null;
  readonly clientAliases?: readonly string[] | null;
  readonly practice?: string | NamedIdentity | null;
  readonly providerRoles?:
    | readonly {
        readonly role: string;
        readonly names?: readonly string[] | null;
        readonly emails?: readonly string[] | null;
      }[]
    | null;
  readonly currentCsm?: string | NamedIdentity | null;
  readonly priorCsms?: readonly InterpretationJson[] | null;
  readonly authorizationNumbers?: readonly string[] | null;
  readonly payers?: readonly InterpretationJson[] | null;
  readonly rbtRequests?: readonly InterpretationJson[] | null;
  readonly candidates?: readonly InterpretationJson[] | null;
  readonly providerRoster?:
    | readonly {
        readonly opportunityId?: string | null;
        readonly id?: string | null;
        readonly opportunityName?: string | null;
        readonly name?: string | null;
      }[]
    | null;
  readonly stage?: string | null;
  readonly stageEntryDate?: string | null;
}
export interface InterpretationPacketInput {
  readonly profile?: InterpretationProfile | null;
  readonly gate?: GateContext | null;
  readonly source?: string;
  readonly sourceRecordId?: string;
  readonly eventDate?: string;
  readonly segment?: string | null;
  readonly matchQuality?: string;
  readonly matchContext?: Readonly<Record<string, InterpretationJson>>;
}

export function compactInterpretationText(value: string | null | undefined = ''): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}
function identityName(
  value: string | NamedIdentity | null | undefined
): string | NamedIdentity | null {
  return (typeof value === 'object' ? value?.name : undefined) ?? value ?? null;
}
export interface TranscriptInterpretationPacket {
  readonly opportunity: {
    readonly id: string | null;
    readonly name: string | null;
    readonly aliases: readonly string[];
    readonly practice: string | NamedIdentity | null;
    readonly providerRoles: readonly {
      readonly role: string;
      readonly names: readonly string[];
      readonly emails: readonly string[];
    }[];
    readonly currentCsm: string | NamedIdentity | null;
    readonly priorCsms: readonly InterpretationJson[];
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
    readonly eventDate: string | undefined;
    readonly matchQuality: string | undefined;
    readonly matchContext: Readonly<Record<string, InterpretationJson>>;
  };
  readonly transcriptSegment: string;
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
  readonly stage?: string;
  readonly authorizationGate?: {
    readonly required?: boolean;
    readonly satisfied?: boolean;
    readonly blocker?: string | null;
  } | null;
} = {}): { readonly processPosition: string; readonly unresolvedGate: string | null | undefined } {
  return {
    processPosition: stage,
    unresolvedGate:
      authorizationGate?.required && !authorizationGate.satisfied
        ? authorizationGate.blocker
        : stage,
  };
}
