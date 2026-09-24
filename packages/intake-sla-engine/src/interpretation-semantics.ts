export interface FindingSemantics {
  readonly category: string | null;
  readonly issueKey: string | null;
  readonly factType: string | null;
  readonly denialReason: string | null;
  readonly appealKind: string | null;
  readonly requestedInformation: string | null;
}
export interface SemanticFinding extends Partial<FindingSemantics> {
  readonly semanticsSupplied?: boolean;
  readonly synthesizedFact?: string | null;
  readonly gateImpact?: string | null;
}
interface SemanticGate {
  readonly processPosition?: string | null;
  readonly unresolvedGate?: string | null;
}
function authorizations(
  supplied: FindingSemantics,
  text: string,
  gate: SemanticGate
): FindingSemantics {
  const gateText = `${gate.processPosition ?? ''} ${gate.unresolvedGate ?? ''}`.toLowerCase();
  const issue = /\binitial\b|\bia\b/.test(gateText)
    ? 'initial-authorization'
    : 'treatment-authorization';
  const hearing = /state[- ]fair hearing/.test(text);
  const appeal = /appeal|reconsider|peer[- ]to[- ]peer|state[- ]fair hearing/.test(text);
  const denied = /denied|denial/.test(text);
  const pending = /pending|waiting|had not received|no response/.test(text);
  return {
    ...supplied,
    category: supplied.category ?? issue,
    issueKey: supplied.issueKey ?? issue,
    appealKind: supplied.appealKind ?? (hearing ? 'state-fair hearing' : null),
    factType:
      supplied.factType ??
      (hearing
        ? 'auth-state-fair-hearing'
        : appeal
          ? 'auth-appeal'
          : denied
            ? 'auth-denial-reason'
            : pending
              ? 'auth-pending'
              : 'ai-interpreted-conversation'),
  };
}
function affirmsMilestone(
  clauses: readonly string[],
  pattern: RegExp,
  laterMilestone: RegExp
): boolean {
  return clauses.some((clause) => {
    const match = clause.match(pattern);
    if (match === null) return false;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const contrast = [...clause.slice(0, start).matchAll(/\bbut\b/g)].at(-1);
    const assertionStart = contrast === undefined ? 0 : contrast.index + contrast[0].length;
    const qualifier = clause
      .slice(end)
      .split(/\b(?:and|but|while)\b/)
      .filter((part, index) => index === 0 || !laterMilestone.test(part))
      .join(' ');
    return !/\b(?:not|never|unconfirmed|unknown|whether)\b/.test(
      clause.slice(assertionStart, end) + qualifier
    );
  });
}
function treatmentPlan(
  supplied: FindingSemantics,
  text: string,
  finding: SemanticFinding
): FindingSemantics {
  // Supported fact clauses establish milestones; implications in gateImpact do not.
  const clauses = (finding.synthesizedFact ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(/[.!?;]/);
  // Whitespace has already been folded to single spaces, so optional literal word groups
  // preserve the source patterns without nested unbounded whitespace quantifiers.
  const submissionOrReview =
    /^ *(?:(?:(?:the|its) )?(?:submission|review)\b|(?:(?:it|the plan) )?(?:has|had) (?:not )?(?:yet )?(?:been )?submitted\b|whether (?:it|the plan) (?:was|has been) submitted\b)/;
  const review = /^ *(?:(?:the|its) )?review\b/;
  const ready =
    affirmsMilestone(
      clauses,
      /(?:treatment plan|plan of care) (?:(?:is|was|has been|had been|is reported as|was reported as) )?(?:complete|completed|ready to submit|otherwise ready)\b/,
      submissionOrReview
    ) ||
    affirmsMilestone(
      clauses,
      /\b(?:completed|complete|ready-to-submit)\s+(?:treatment plan|plan of care)\b/,
      submissionOrReview
    );
  const revisions = /add .*score|incorporat|edit|revision|correction/.test(text);
  const submitted =
    affirmsMilestone(
      clauses,
      /(?:treatment plan|plan of care)\s+(?:was|has been|is)\s+submitted\b/,
      review
    ) ||
    affirmsMilestone(clauses, /\bsubmitted (?:the )?(?:treatment plan|plan of care)\b/, review);
  return {
    ...supplied,
    category: supplied.category ?? 'treatment-plan',
    issueKey: supplied.issueKey ?? (submitted ? 'clinical-review' : 'treatment-plan'),
    factType:
      supplied.factType ??
      (revisions
        ? 'tp-revisions'
        : ready
          ? 'tp-ready'
          : submitted
            ? 'tp-submitted'
            : 'tp-drafting'),
  };
}
function categoryResult(
  supplied: FindingSemantics,
  category: string,
  factType: string
): FindingSemantics {
  return {
    ...supplied,
    category: supplied.category ?? category,
    issueKey: supplied.issueKey ?? category,
    factType: supplied.factType ?? factType,
  };
}
function documentation(supplied: FindingSemantics, text: string): FindingSemantics {
  const received =
    /received|completed|obtained|provided/.test(text) &&
    !/not received|not completed|missing|outstanding/.test(text);
  return categoryResult(
    supplied,
    'required-documentation',
    received ? 'required-document-received' : 'required-document'
  );
}
function staffing(supplied: FindingSemantics, text: string): FindingSemantics {
  const lost = /rejected|declined|did not sign|did not respond|fell through|no longer/.test(text);
  const assigned = /assigned|matched|hired/.test(text) && !/not assigned|unconfirmed/.test(text);
  return categoryResult(
    supplied,
    'rbt-staffing',
    lost ? 'rbt-lost' : assigned ? 'rbt-assigned' : 'rbt-candidate'
  );
}
function suppliedValue(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
/** Preserve interpreter-owned semantics; this is only the approved legacy untyped-finding fallback. */
export function interpretedFindingSemantics(
  finding: SemanticFinding = {},
  gate: SemanticGate = {}
): FindingSemantics {
  const supplied: FindingSemantics = {
    category: suppliedValue(finding.category),
    issueKey: suppliedValue(finding.issueKey),
    factType: suppliedValue(finding.factType),
    denialReason: suppliedValue(finding.denialReason),
    appealKind: suppliedValue(finding.appealKind),
    requestedInformation: suppliedValue(finding.requestedInformation),
  };
  if (
    finding.semanticsSupplied === true ||
    (supplied.category && supplied.issueKey && supplied.factType)
  )
    return supplied;
  const text = `${finding.synthesizedFact ?? ''} ${finding.gateImpact ?? ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (/authorization|payer|denial|appeal|reconsider|state[- ]fair hearing/.test(text))
    return authorizations(supplied, text, gate);
  if (/clinical quality|clinical review|returned .*edit|edits? .*returned|resubmission/.test(text))
    return categoryResult(
      supplied,
      'clinical-review',
      /edit|revision|resubmission/.test(text) ? 'tp-revisions' : 'tp-clinical-review'
    );
  if (/treatment plan|plan of care/.test(text)) return treatmentPlan(supplied, text, finding);
  if (/vineland|basc|diagnostic|service order|referral|signature|required document/.test(text))
    return documentation(supplied, text);
  if (/\brbt\b|candidate|staffing|screening|interview|offer/.test(text))
    return staffing(supplied, text);
  if (/97153|direct-care|treatment start|start date/.test(text))
    return categoryResult(supplied, 'first-97153', 'treatment-start-planned');
  if (/initial assessment|\bia\b|97151/.test(text))
    return categoryResult(supplied, 'initial-assessment', 'ia-planned');
  return supplied;
}
