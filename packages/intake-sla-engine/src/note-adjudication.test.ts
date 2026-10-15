import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveGate } from './gate-engine.js';
import { sha256Json } from './json-fingerprint.js';
import { verifyNoteAdjudicationArtifacts } from './note-adjudication-storage.js';
import type { NoteAdjudicationInput } from './note-adjudication-types.js';
import { createNoteAdjudicator } from './note-adjudication.js';
import { adjudicatedNoteFreshnessInput } from './note-freshness.js';
import { writePrivateJson } from './private-run-storage.js';

const runId = 'synthetic-run';
const asOf = '2026-09-18T20:00:00.000Z';
const noteInput: NoteAdjudicationInput = {
  opportunityId: 'synthetic-one',
  source: 'SLA update',
  sourceRecordId: 'synthetic-sla:1',
  noteRecordId: 'synthetic-sla',
  eventDate: '2026-09-17',
  rawText: 'RBT recruiting is paused',
  stageEntryDate: '2026-09-01',
  gate: { gateCategory: 'rbt', processPosition: 'RBT staffing' },
  context: { source: 'synthetic' },
};
const finding = {
  matchedOpportunityId: 'synthetic-one',
  synthesizedFact: 'RBT recruiting is paused pending a restart decision.',
  gateImpact: 'Confirm the staffing restart condition.',
  substantive: true,
  relationship: 'Supports',
  supportSpan: 'RBT recruiting is paused',
  actionOwner: 'RBT Team',
  actionType: 'RBT Follow-Up',
  recommendedAction: 'RBT Team to confirm the staffing restart condition.',
  milestoneDate: null,
  followUpDate: null,
  category: 'rbt',
  issueKey: 'rbt-staffing',
  factType: 'rbt-recruiting-paused',
  milestoneKind: null,
};
interface NoteFixture {
  schemaVersion: number;
  runId: string;
  sourceCutoff: string;
  executionProvenance: { kind: string };
  decisions: Record<string, unknown>[];
}
function artifact(
  input = noteInput,
  disposition = 'substantive',
  findings: unknown = [finding]
): NoteFixture {
  const planner = createNoteAdjudicator({ runId, asOf });
  planner.interpret(input);
  return {
    schemaVersion: 1,
    runId,
    sourceCutoff: asOf,
    executionProvenance: { kind: 'codex-current-run' },
    decisions: [
      {
        opportunityId: input.opportunityId,
        sourceRecordId: input.sourceRecordId,
        packetHash: planner.packets[0]?.packetHash,
        disposition,
        rationale: 'Reviewed the bounded source and its current gate context.',
        supportSpan: input.rawText,
        findings,
        retainedMetadata: { synthetic: true },
      },
    ],
  };
}
describe('bound current-run note judgment', () => {
  it('accepts the source-shaped Date cutoff with identical packet and decision bindings', () => {
    const runAt = new Date(asOf);
    const fromDate = createNoteAdjudicator({ runId, asOf: runAt, artifact: artifact() });
    const fromString = createNoteAdjudicator({ runId, asOf, artifact: artifact() });
    fromDate.interpret(noteInput);
    fromString.interpret(noteInput);
    expect(fromDate.packets).toEqual(fromString.packets);
    expect(fromDate.receipts).toEqual(fromString.receipts);
    fromDate.assertConsumed();
    expect(runAt.toISOString()).toBe(asOf);
    expect(() => createNoteAdjudicator({ runId, asOf: new Date('invalid') })).toThrow(RangeError);
  });
  it('accepts the typed gate producer without an index-signature cast or gate projection', () => {
    const gate = resolveGate({ stage: 'TA Requested', asOf });
    const planner = createNoteAdjudicator({ runId, asOf });
    planner.interpret({ ...noteInput, gate });
    expect(planner.packets[0]?.gate).toBe(gate);
  });
  it('records supported typed judgment with exact bindings and preserves missing-decision fallback', () => {
    const inputArtifact = artifact();
    const reviewer = createNoteAdjudicator({ runId, asOf, artifact: inputArtifact });
    const events = reviewer.interpret(noteInput);
    reviewer.assertConsumed();
    expect(events).toHaveLength(1);
    expect(events?.[0]).toMatchObject({
      category: 'rbt',
      issueKey: 'rbt-staffing',
      factType: 'rbt-recruiting-paused',
      matchQuality: 'Direct',
      processRelevance: 10,
      milestoneKind: null,
      rawText: noteInput.rawText,
      interpretationProvenance: {
        kind: 'codex-current-run',
        packetHash: reviewer.packets[0]?.packetHash,
        decisionHash: sha256Json(inputArtifact.decisions[0]),
      },
    });
    expect(reviewer.reviewedNoteIds('synthetic-one')).toEqual(new Set(['synthetic-sla']));
    expect(reviewer.reviewedNoteIds('different')).toEqual(new Set());
    expect(reviewer.administrativeNote('synthetic-one', 'synthetic-sla')).toBe(false);
    expect(reviewer.receipts[0]).toMatchObject({ acceptedFindings: 1, disposition: 'substantive' });
    const planner = createNoteAdjudicator({ runId, asOf });
    expect(planner.interpret(noteInput)).toBeNull();
    expect(planner.administrativeNote('synthetic-one', 'synthetic-sla')).toBe(false);
    expect(planner.packets).toHaveLength(1);
    planner.assertConsumed();
    const otherGate = { ...noteInput, gate: { gateCategory: 'different' } };
    expect(
      createNoteAdjudicator({ runId, asOf, artifact: artifact(otherGate) }).interpret(
        otherGate
      )?.[0]?.processRelevance
    ).toBe(7);
  });
  it('adjudicates administrative wording without manufacturing evidence or dismissing another segment', () => {
    const input = { ...noteInput, rawText: 'On the agenda for the provider meeting' };
    const reviewer = createNoteAdjudicator({
      runId,
      asOf,
      artifact: artifact(input, 'administrative', []),
    });
    expect(reviewer.interpret(input)).toEqual([]);
    expect(reviewer.administrativeNote('synthetic-one', 'synthetic-sla')).toBe(true);
    expect(reviewer.interpret({ ...noteInput, sourceRecordId: 'synthetic-sla:2' })).toBeNull();
    expect(reviewer.administrativeNote('synthetic-one', 'synthetic-sla')).toBe(false);
    reviewer.assertConsumed();
  });
  it('rejects mismatched run, cutoff, packet, support, typed findings, duplicate and unconsumed decisions', () => {
    const base = artifact();
    for (const override of [
      { schemaVersion: 2 },
      { runId: 'old-run' },
      { sourceCutoff: '2026-09-17T20:00:00.000Z' },
      { executionProvenance: { kind: 'prior-run' } },
      { decisions: null },
    ])
      expect(() =>
        createNoteAdjudicator({ runId, asOf, artifact: { ...base, ...override } })
      ).toThrow('current-run provenance');
    expect(() =>
      createNoteAdjudicator({
        runId,
        asOf,
        artifact: { ...base, decisions: [...base.decisions, ...base.decisions] },
      })
    ).toThrow('Duplicate');
    for (const override of [
      { packetHash: 'wrong' },
      { disposition: 'unknown' },
      { rationale: 'short' },
      { supportSpan: 'different unsupported text' },
      { supportSpan: 'short' },
      { findings: [{ ...finding, category: null }] },
      { findings: [{ ...finding, relationship: 'Neutral' }] },
      { findings: [{ ...finding, supportSpan: 'not in the source' }] },
      { findings: [{ ...finding, matchedOpportunityId: 'different' }] },
      { findings: [] },
      { disposition: 'administrative' },
    ]) {
      const inputArtifact = { ...base, decisions: [{ ...base.decisions[0], ...override }] };
      const reviewer = createNoteAdjudicator({ runId, asOf, artifact: inputArtifact });
      expect(() => reviewer.interpret(noteInput)).toThrow();
    }
    expect(() =>
      createNoteAdjudicator({ runId, asOf, artifact: base }).interpret({
        ...noteInput,
        rawText: `${noteInput.rawText} and later changes`,
      })
    ).toThrow('binding mismatch');
    const unused = createNoteAdjudicator({ runId, asOf, artifact: base });
    expect(() => {
      unused.assertConsumed();
    }).toThrow('unmatched records');
    for (const eventDate of ['invalid', '2026-09-19']) {
      const input = { ...noteInput, eventDate };
      expect(() =>
        createNoteAdjudicator({ runId, asOf, artifact: artifact(input) }).interpret(input)
      ).toThrow('source date');
    }
  });
  it('substitutes only reviewed note fields for freshness without changing captured source or appointment fields', () => {
    const opportunity = {
      Id: 'synthetic-one',
      Current_SLA__c: 'synthetic-sla',
      Current_SLA__r: {
        Reason_for_Delay_Notes__c: noteInput.rawText,
        LastModifiedDate: '2026-09-17',
      },
      Intake_Notes__c: 'Independent intake note',
      On_Hold_Notes__c: 'Independent hold note',
      StageName: 'IA Scheduled',
      IA_Scheduled_For__c: '2026-09-22',
    };
    const before = structuredClone(opportunity);
    const events = [{ sourceRecordId: 'synthetic-sla:1' }, { sourceRecordId: 'other:1' }];
    const result = adjudicatedNoteFreshnessInput(opportunity, events, new Set(['synthetic-sla']));
    expect(opportunity).toEqual(before);
    expect(result.opportunity).toEqual({
      ...before,
      Current_SLA__r: { ...before.Current_SLA__r, Reason_for_Delay_Notes__c: '' },
    });
    expect(result.events).toEqual([events[0]]);
    expect(adjudicatedNoteFreshnessInput(opportunity, events, new Set())).toEqual({
      opportunity,
      events: [],
    });
    const all = adjudicatedNoteFreshnessInput(
      { ...opportunity, Current_SLA__c: '', Current_SLA__r: null },
      events,
      new Set(['synthetic-one:sla-note', 'synthetic-one:intake-note', 'synthetic-one:on-hold-note'])
    );
    expect(all.opportunity).toMatchObject({
      Current_SLA__r: { Reason_for_Delay_Notes__c: '' },
      Intake_Notes__c: '',
      On_Hold_Notes__c: '',
    });
    expect(
      adjudicatedNoteFreshnessInput({ Id: 'synthetic-one' }, [], new Set(['unrelated'])).opportunity
    ).toMatchObject({ Current_SLA__r: { Reason_for_Delay_Notes__c: undefined } });
  });
  it('verifies immutable build bindings and rejects missing, edited or malformed local receipts', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-note-test-'));
    try {
      expect(await verifyNoteAdjudicationArtifacts(directory, {})).toBe(true);
      const inputArtifact = artifact();
      const reviewer = createNoteAdjudicator({ runId, asOf, artifact: inputArtifact });
      reviewer.interpret(noteInput);
      const manifest = {
        noteAdjudications: {
          inputHash: reviewer.inputHash,
          receiptsHash: sha256Json(reviewer.receipts),
          accepted: 1,
        },
      };
      await writePrivateJson(path.join(directory, 'note_adjudications.json'), inputArtifact);
      await expect(verifyNoteAdjudicationArtifacts(directory, {})).rejects.toThrow(
        'changed after build'
      );
      await expect(verifyNoteAdjudicationArtifacts(directory, manifest)).rejects.toThrow(
        'changed after build'
      );
      await writePrivateJson(
        path.join(directory, 'note_adjudication_receipts.json'),
        reviewer.receipts
      );
      expect(await verifyNoteAdjudicationArtifacts(directory, manifest)).toBe(true);
      await expect(
        verifyNoteAdjudicationArtifacts(directory, {
          noteAdjudications: { ...manifest.noteAdjudications, accepted: 2 },
        })
      ).rejects.toThrow('changed after build');
      await writePrivateJson(path.join(directory, 'note_adjudications.json'), {
        ...inputArtifact,
        extra: 'changed after build',
      });
      await expect(verifyNoteAdjudicationArtifacts(directory, manifest)).rejects.toThrow(
        'changed after build'
      );
      await fs.writeFile(path.join(directory, 'note_adjudications.json'), 'invalid JSON');
      await expect(verifyNoteAdjudicationArtifacts(directory, manifest)).rejects.toThrow(
        SyntaxError
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
