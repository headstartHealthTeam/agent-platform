import { createHash } from 'node:crypto';

export interface FlowFingerprint {
  readonly activeVersionId: string;
  readonly versionNumber: number;
}
export interface ProductionFingerprint {
  readonly apex: Readonly<Record<string, string>>;
  readonly flows: Readonly<Record<string, FlowFingerprint>>;
  readonly slaMetadata: unknown;
}
export type ActualProductionFingerprint = Partial<ProductionFingerprint> & {
  readonly checkedAt?: string | null;
};
export interface FingerprintChange {
  readonly type: 'Apex' | 'Flow' | 'Custom Metadata';
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
}
export interface FingerprintComparison {
  readonly publishable: boolean;
  readonly changes: readonly FingerprintChange[];
  readonly checkedAt: string;
}

export function sha256(value: string): string {
  const canonical = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  return createHash('sha256').update(canonical).digest('hex');
}

export function compareProductionFingerprint(
  expected: ProductionFingerprint,
  actual: ActualProductionFingerprint
): FingerprintComparison {
  const changes: FingerprintChange[] = [];
  const apex = new Map(Object.entries(actual.apex ?? {}));
  const flows = new Map(Object.entries(actual.flows ?? {}));
  for (const [name, digest] of Object.entries(expected.apex)) {
    if (apex.get(name) !== digest)
      changes.push({
        type: 'Apex',
        name,
        expected: digest,
        actual: apex.get(name) ?? 'Missing',
      });
  }
  for (const [name, flow] of Object.entries(expected.flows)) {
    const current = flows.get(name);
    if (
      current?.activeVersionId !== flow.activeVersionId ||
      current.versionNumber !== flow.versionNumber
    ) {
      changes.push({
        type: 'Flow',
        name,
        expected: `${flow.activeVersionId} v${String(flow.versionNumber)}`,
        actual:
          current === undefined
            ? 'Missing'
            : `${current.activeVersionId} v${String(current.versionNumber)}`,
      });
    }
  }
  // Preserve the reviewed metadata ordering contract; this is deliberately not canonical JSON.
  if (JSON.stringify(expected.slaMetadata) !== JSON.stringify(actual.slaMetadata)) {
    changes.push({
      type: 'Custom Metadata',
      name: 'Intake_SLA__mdt',
      expected: expected.slaMetadata,
      actual: actual.slaMetadata,
    });
  }
  return {
    publishable: changes.length === 0,
    changes,
    checkedAt: actual.checkedAt ?? new Date().toISOString(),
  };
}
