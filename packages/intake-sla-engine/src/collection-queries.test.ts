import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import * as q from './collection-queries.js';
describe('approved collection query contract', () => {
  it('retains every original query byte, field, limit, relation and escaping rule', () => {
    const opportunityIds = [
      ['006', '000000000001AAA'].join(''),
      ['006', '000000000002AAA'].join(''),
    ];
    const primaryContactIds = ['contact-one', 'contact-two'];
    const csmNames = ["Staff O'Example\\North"];
    const ids = ['related-one', 'related-two'];
    const initial = q.initialCollectionQueries({ opportunityIds, primaryContactIds, csmNames });
    const line = q.approvedLineCollectionQueries();
    const queries = [
      q.INTAKE_OPPORTUNITY_QUERY,
      initial.authorizations,
      initial.authorizationReviews,
      initial.vobs,
      initial.clinicalQuality,
      initial.rbtRequests,
      initial.directStaffing,
      initial.directTasks,
      initial.directAircalls,
      initial.opportunityHistory,
      initial.contactRoles,
      initial.contacts,
      initial.csmUsers,
      q.assignedStaffingCollectionQuery(ids),
      line.tasks,
      line.aircalls,
      q.taskFeedCollectionQuery(ids),
      q.ticketMatchCollectionQuery(ids),
      q.firstInterviewCollectionQuery(ids),
      q.talentAcquisitionCollectionQuery(ids),
    ];
    // SHA-256 of the original 15b66ac templates evaluated with these exact synthetic bindings.
    expect(
      queries.map((query) =>
        createHash('sha256')
          .update(query ?? '')
          .digest('hex')
      )
    ).toEqual([
      '175d1ae05943e2c1acfe3a4aba1c7c08148095b1396e1fe8d6939d5a04e8fa3a',
      'caed6c82d54880bc119f922026910fadee26ade59524d7dda31ced0f1939f8c0',
      '0ea757cbdaa6a639005fe2256b9807d04b32f486cb4b480a0c42665a1602b442',
      'd4dc0a59e2e159d60b1f1656bc16d880cc7c4c888b71a3084e218c174b0abab6',
      '073000260b71e49ad28c94297a6e48453bc3ae52721b87f6abbf13c259e36326',
      'd427a4ff46f8d98475ebb6d31aef7d246a136911f639245a6305d86e62cd684f',
      'c7e8a161d60254b9b0e1c7597eeea2b924665da055701c43cda3f34e0f3a6d4b',
      'e77a544178c5adf748cf742a68520e3020588ca06068be729abc8d61ec86adec',
      '1c224c5121cad1f2149db580e290d09c0b3e7fe5a97d97f43e83841f9a2a794d',
      'b202c3666767f9ee8d8ef2daa5bab7fd38f2925aaae69b10b07f2417bc33adee',
      '504c85b3c4b2fb288b159769ad7a69bb53c67f5e1f03d06682bbef5a1846f894',
      '2f3da1794dc9eec47dca6f72d6be782e9aef906fe872919da8e44a9653452b3b',
      'b3d39f0389e004214e4e0761bcd8c049a5d8486a48ac4689031491fe018b9f28',
      'd192351379366d0407aed9d0193b881848c232e415d9de63a9a67cd58b9d77d6',
      'aab2c7bfb04d43337715db809d7a3892e9ba5755157b1cce441a0524f13491fe',
      '101a671cc69b82f6ba3f2a88a9fd53ea40e19a0df2071b705d451e6fa9338e39',
      '882e86bd4b939a4f10df61ed547d538697b37f584dbaa2038fb64263946d15d1',
      'f91451775ee6a1d93388df859b3c55e034073773bd3d75692bf6f19055866935',
      '8212796260f20a7eba0600b6d47c463e2fa427755bbcefe2cf8ec666bb80487f',
      '943f2496d9f4e9cb5b982c2edb4ddc6f8dc2e4dfb710f4272f5aaeeec3eb6d4a',
    ]);
  });
  it('does not invent contact/user queries or allow an unbounded Billing cohort', () => {
    const emptyRelated = q.initialCollectionQueries({
      opportunityIds: [['006', '000000000001AAA'].join('')],
      primaryContactIds: [],
      csmNames: [],
    });
    expect(emptyRelated.contacts).toBeNull();
    expect(emptyRelated.csmUsers).toBeNull();
    expect(() =>
      q.initialCollectionQueries({ opportunityIds: [], primaryContactIds: [], csmNames: [] })
    ).toThrow('explicit Salesforce Opportunity IDs');
    expect(() =>
      q.initialCollectionQueries({
        opportunityIds: ['invalid'],
        primaryContactIds: [],
        csmNames: [],
      })
    ).toThrow('explicit Salesforce Opportunity IDs');
  });
});
