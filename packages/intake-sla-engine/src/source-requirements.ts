export interface SourceContext {
  readonly stage?: string | null | undefined;
  readonly unresolvedGate?: string | null;
  readonly blocker?: string | null;
  readonly summary?: string | null;
}
export interface SourceRequirementResult {
  readonly source: string;
  readonly status: string;
  readonly required?: boolean;
}
export function isProviderFacingStage(stage: string | null | undefined = ''): boolean {
  return /ia approved|ia scheduled|ic scheduled|ic completed|97151|treatment plan|ta approved|first day of 97153/i.test(
    String(stage)
  );
}
function familyContactRequired(context: SourceContext): boolean {
  return /family|parent|guardian|custody|availability|unresponsive|cannot be reached|overlapping or duplicate services/i.test(
    `${context.unresolvedGate ?? ''} ${context.blocker ?? ''} ${context.summary ?? ''}`
  );
}
function rbtStage(context: SourceContext): boolean {
  return /ta approved|first day of 97153|rbt|staffing|candidate/i.test(
    `${context.stage ?? ''} ${context.unresolvedGate ?? ''} ${context.blocker ?? ''}`
  );
}

export function requiredSourcesForContext(context: SourceContext = {}): string[] {
  const required = new Set([
    'Salesforce Opportunity / SLA',
    'Salesforce Stage History',
    'SLA / Intake / On-Hold Notes',
    'Tasks / Task Chatter',
    'Slack',
  ]);
  const stage = (context.stage ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (/insurance verification|ia requested/.test(stage)) {
    required.add('Authorization');
    required.add('Authorization Review');
    required.add('VOB');
  }
  if (stage.includes('ta requested')) {
    required.add('Authorization');
    required.add('Authorization Review');
  }
  if (/97151|treatment plan/.test(stage)) required.add('Clinical Quality');
  if (/^97151 started\b/.test(stage)) required.add('Portal Auth Requests');
  if (rbtStage(context))
    for (const source of [
      'RBT Request',
      'Ticket Match',
      'Talent Acquisition',
      'RBT First Interview',
      'Staffing',
    ])
      required.add(source);
  if (isProviderFacingStage(stage)) {
    required.add('Fireflies');
    required.add('Portal');
  }
  if (familyContactRequired(context)) required.add('Calls / Texts');
  if (/scheduled|97151|97153|first day/i.test(`${stage} ${context.unresolvedGate ?? ''}`))
    required.add('Linked Billing / Claims');
  return [...required];
}

export function blockingRequiredSources<T extends SourceRequirementResult>(
  results: readonly T[] = []
): T[] {
  return results.filter(
    (result) =>
      result.required !== false && ['Blocked', 'Timed Out', 'Unsupported'].includes(result.status)
  );
}
export function applyStageSourceRequirements<T extends SourceRequirementResult>(
  results: readonly T[] = [],
  context: SourceContext = {}
): (Omit<T, 'required'> & { readonly required: boolean; readonly requirementBasis: string })[] {
  const required = new Set(requiredSourcesForContext(context));
  return results.map((result) => ({
    ...result,
    required: required.has(result.source),
    requirementBasis: required.has(result.source)
      ? 'Required for the current process gate'
      : 'Searched for enrichment; failure does not block this gate',
  }));
}
interface InterpretationBlock {
  readonly status: 'Blocked';
  readonly required: true;
  readonly detail: string;
}
export function enforceConversationInterpretationRequirement<T extends SourceRequirementResult>({
  results = [],
  context = {},
  firefliesCandidateSegments = 0,
  aiInterpretationAvailable = true,
  aiInterpretationFailures = 0,
}: {
  readonly results?: readonly T[];
  readonly context?: SourceContext;
  readonly firefliesCandidateSegments?: number;
  readonly aiInterpretationAvailable?: boolean;
  readonly aiInterpretationFailures?: number;
}): readonly (T | (Omit<T, keyof InterpretationBlock> & InterpretationBlock))[] {
  if (!isProviderFacingStage(context.stage)) return results;
  return results.map((result) => {
    if (result.source !== 'Fireflies' || firefliesCandidateSegments < 1) return result;
    if (aiInterpretationAvailable && aiInterpretationFailures === 0) return result;
    return {
      ...result,
      status: 'Blocked',
      required: true,
      detail: aiInterpretationAvailable
        ? `AI transcript interpretation failed for ${String(aiInterpretationFailures)} candidate segment(s).`
        : 'Candidate Fireflies transcript segments were found, but model interpretation was unavailable.',
    };
  });
}
