import type { RecommendationCandidate } from './recommendation-types.js';

export function assignedRbtName(event?: RecommendationCandidate | null): string | null {
  if (!event || !['rbt-assigned', 'treatment-start-planned'].includes(event.factType ?? '')) {
    return null;
  }
  // A Ticket Match or Talent record can show a proposed/hired candidate, but
  // it is not proof that the client has an assigned RBT.
  if (!['RBT Request', 'Staffing'].includes(event.source ?? '')) return null;
  if (event.candidateName) {
    return event.candidateName;
  }
  const value = event.text ?? event.fact ?? '';
  return (
    /^(.+?) (?:is|was) assigned\b/i.exec(value)?.[1] ??
    /^As of \d{4}-\d{2}-\d{2}, (.+?) has reached (?:hired|accepted|matched)\b/i.exec(value)?.[1] ??
    null
  );
}

export function selectedRbtCandidate(event?: RecommendationCandidate | null): string | null {
  if (
    event?.factType !== 'rbt-assigned' ||
    !event.candidateName ||
    ['RBT Request', 'Staffing'].includes(event.source ?? '')
  ) {
    return null;
  }
  return event.candidateName;
}

export function candidateStepSentence(event?: RecommendationCandidate | null): string {
  const parts = (event?.candidateStep ?? '')
    .split(';')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return 'has a candidate status that requires confirmation';
  if (parts.length === 1) return `is at ${parts[0] ?? ''}`;
  if (parts[0] === 'proposed') {
    return `is proposed to the provider while the candidate record is at ${parts[1] ?? ''}`;
  }
  return `reached ${parts[0] ?? ''} and is marked ${parts[1] ?? ''}`;
}

export function requiredItemFromEvent(event?: RecommendationCandidate | null): string | null {
  if (!event) return null;
  const requested = event.requestedInformation ?? '';
  if (requested) {
    return requested;
  }
  const text = event.fact ?? event.text ?? '';
  const known: readonly [RegExp, string][] = [
    [/\bBASC\b/i, 'the BASC assessment'],
    [/\bVineland\b/i, 'the Vineland assessment'],
    [/\bservice order\b|\bSOA\b/i, 'the signed service order'],
    [
      /\bdiagnostic (?:evaluation|report)\b|\bpsychological report\b/i,
      'the current diagnostic evaluation',
    ],
    [/\bparent (?:or guardian )?signature\b/i, 'the parent or guardian signature'],
    [/\bprovider signature\b/i, 'the provider signature'],
  ];
  return known.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
