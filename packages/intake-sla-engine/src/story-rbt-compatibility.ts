import type { StoryFact } from './story-types.js';

export function compatibleRbtHireAndPrerequisite(
  left: StoryFact | null | undefined,
  right: StoryFact | null | undefined
): boolean {
  if (
    !left ||
    !right ||
    [left, right].some(
      (event) =>
        !['rbt-assigned', 'rbt-candidate'].includes(event.factType ?? '') ||
        event.candidateActive === false
    )
  )
    return false;
  if (
    left.candidateName &&
    right.candidateName &&
    left.candidateName.toLowerCase() !== right.candidateName.toLowerCase()
  )
    return false;
  // A bare hire assertion can coexist with a stated remaining prerequisite.
  // Two assigned/candidate types alone do not establish factual compatibility.
  const bareHire = (event: StoryFact): boolean =>
    /^(?:(?:the )?provider (?:has )?hired (?:an?|the) rbt|(?:an?|the) rbt (?:is|was|has been) (?:hired|assigned|matched))[.!]?$/.test(
      (event.text ?? '').toLowerCase().trim()
    );
  const hireWithPrerequisite = (event: StoryFact): boolean => {
    const text = (event.text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    // Require an affirmed hire with its own remaining prerequisite. Merely
    // mentioning a hire and an uncertainty/pending state is not compatibility.
    return (
      /^(?:(?:the )?(?:hired|assigned|matched) rbt (?:still )?(?:needs?|requires?|is awaiting|is waiting for)\b|(?:the )?rbt (?:is|was|has been) (?:hired|assigned|matched)[,;]? (?:and|but) (?:still )?(?:needs?|requires?|is awaiting|is waiting for)\b)/.test(
        text
      ) &&
      !/\b(?:resigned|withdrew|withdrawn|terminated|replacement|no longer)\b|\b(?:not|never)\s+(?:been\s+|)(?:hired|assigned|matched)\b/.test(
        text
      )
    );
  };
  return (
    (bareHire(left) && hireWithPrerequisite(right)) ||
    (bareHire(right) && hireWithPrerequisite(left))
  );
}
