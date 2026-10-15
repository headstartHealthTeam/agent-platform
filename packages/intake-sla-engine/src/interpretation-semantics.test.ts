import { describe, expect, it } from 'vitest';

import { interpretedFindingSemantics } from './interpretation-semantics.js';

describe('approved interpretation semantic projection', () => {
  it('never overwrites explicitly supplied semantic judgment, including deliberately empty semantics', () => {
    const finding = {
      synthesizedFact: 'The treatment plan is complete.',
      category: 'custom',
      issueKey: 'custom-issue',
      factType: 'custom-fact',
      denialReason: 'retained',
      appealKind: 'retained',
      requestedInformation: 'retained',
    };
    expect(interpretedFindingSemantics(finding)).toEqual({
      category: 'custom',
      issueKey: 'custom-issue',
      factType: 'custom-fact',
      denialReason: 'retained',
      appealKind: 'retained',
      requestedInformation: 'retained',
    });
    expect(
      interpretedFindingSemantics({
        semanticsSupplied: true,
        synthesizedFact: finding.synthesizedFact,
      })
    ).toMatchObject({ category: null, issueKey: null, factType: null });
    expect(interpretedFindingSemantics()).toEqual({
      category: null,
      issueKey: null,
      factType: null,
      denialReason: null,
      appealKind: null,
      requestedInformation: null,
    });
  });
  it('preserves existing fallback category priority and partial supplied fields', () => {
    for (const [text, category, factType] of [
      [
        'State-fair hearing for the denied authorization',
        'treatment-authorization',
        'auth-state-fair-hearing',
      ],
      ['Authorization appeal pending', 'treatment-authorization', 'auth-appeal'],
      ['Payer denial', 'treatment-authorization', 'auth-denial-reason'],
      ['Authorization waiting', 'treatment-authorization', 'auth-pending'],
      ['Payer discussed', 'treatment-authorization', 'ai-interpreted-conversation'],
      ['Clinical quality returned edits', 'clinical-review', 'tp-revisions'],
      ['Clinical review pending', 'clinical-review', 'tp-clinical-review'],
      ['Vineland received', 'required-documentation', 'required-document-received'],
      ['BASC not completed', 'required-documentation', 'required-document'],
      ['RBT declined', 'rbt-staffing', 'rbt-lost'],
      ['Candidate hired', 'rbt-staffing', 'rbt-assigned'],
      ['Staffing unconfirmed', 'rbt-staffing', 'rbt-candidate'],
      ['97153 start date', 'first-97153', 'treatment-start-planned'],
      ['Initial assessment scheduled', 'initial-assessment', 'ia-planned'],
    ] as const)
      expect(interpretedFindingSemantics({ synthesizedFact: text })).toMatchObject({
        category,
        factType,
      });
    expect(
      interpretedFindingSemantics(
        { synthesizedFact: 'Authorization pending', category: 'keep' },
        { processPosition: 'Initial assessment' }
      )
    ).toMatchObject({ category: 'keep', issueKey: 'initial-authorization' });
    expect(
      interpretedFindingSemantics(
        {
          synthesizedFact: 'Authorization pending',
          issueKey: 'keep',
          factType: 'keep',
          appealKind: 'keep',
        },
        { unresolvedGate: 'IA' }
      )
    ).toMatchObject({
      category: 'initial-authorization',
      issueKey: 'keep',
      factType: 'keep',
      appealKind: 'keep',
    });
  });
  it('retains milestone qualifiers and does not turn gate implications into completed events', () => {
    for (const text of [
      'The treatment plan is not complete.',
      'The treatment plan is complete and that claim remains unconfirmed.',
      'The treatment plan is complete but that claim remains unconfirmed.',
      'Unknown whether the treatment plan is complete and it has been submitted.',
      'The treatment plan has been submitted and that claim remains unconfirmed.',
    ])
      expect(interpretedFindingSemantics({ synthesizedFact: text }).factType).toBe('tp-drafting');
    expect(
      interpretedFindingSemantics({
        synthesizedFact: 'The treatment plan is being drafted.',
        gateImpact: 'Once the treatment plan is complete it can be submitted.',
      }).factType
    ).toBe('tp-drafting');
    for (const text of [
      'The treatment plan is complete.',
      'The completed treatment plan is available.',
      'The treatment plan is complete but the review remains unconfirmed.',
      'The session is not done but the treatment plan is complete.',
      'The treatment plan is complete and it has not yet been submitted.',
    ])
      expect(interpretedFindingSemantics({ synthesizedFact: text }).factType).toBe('tp-ready');
    for (const whitespace of [' ', '\t', '\n', '\u00a0']) {
      expect(
        interpretedFindingSemantics({
          synthesizedFact:
            'The treatment plan is complete and it has not yet been submitted.'.replaceAll(
              ' ',
              whitespace
            ),
        }).factType
      ).toBe('tp-ready');
      expect(
        interpretedFindingSemantics({
          synthesizedFact:
            'The treatment plan is complete and that remains unconfirmed.'.replaceAll(
              ' ',
              whitespace
            ),
        }).factType
      ).toBe('tp-drafting');
    }
    for (const text of ['The treatment plan has been submitted.', 'Submitted the treatment plan.'])
      expect(interpretedFindingSemantics({ synthesizedFact: text })).toMatchObject({
        factType: 'tp-submitted',
        issueKey: 'clinical-review',
      });
    expect(
      interpretedFindingSemantics({ synthesizedFact: 'The treatment plan requires correction.' })
        .factType
    ).toBe('tp-revisions');
  });
});
