import { expectTypeOf, it } from 'vitest';

import type { EvidenceOrigin, ExactEvidenceReference } from './evidence.js';

it('requires retained parents for derived evidence while accepting multiple exact parents', () => {
  type Sources = Extract<EvidenceOrigin, { kind: 'runtime-derived' }>['sources'];
  expectTypeOf<[]>().not.toExtend<Sources>();
  expectTypeOf<[ExactEvidenceReference]>().toExtend<Sources>();
  expectTypeOf<[ExactEvidenceReference, ExactEvidenceReference]>().toExtend<Sources>();
});
