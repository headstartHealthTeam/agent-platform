export function normalizeOperationalText(value: unknown = ''): string {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripConversationHtml(value: unknown = ''): string {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanConversationSentence(value: unknown = ''): string {
  return stripConversationHtml(value)
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTreatmentPlanStatusInquiry(text = ''): boolean {
  const value = stripConversationHtml(text);
  return (
    /\b(?:can|could|would)\s+(?:you|we|someone)\b.{0,120}\b(?:find out|confirm|check|ask)\b.{0,160}\b(?:treatment plan|\btp\b)/i.test(
      value
    ) ||
    /\bwhen\b.{0,100}\b(?:provider|bcba)\b.{0,100}\b(?:complete|finish|submit|send)\b[^?]*\?/i.test(
      value
    ) ||
    /\b(?:has|have|did|was|were|is|are)\b.{0,100}\b(?:treatment plan|\btp\b)\b.{0,100}\b(?:submitted|sent|completed|finished|reviewed|ready)\b[^?]*\?/i.test(
      value
    ) ||
    /\b(?:treatment plan|\btp\b)\b.{0,100}\b(?:submitted|sent|completed|finished|reviewed|ready)\b[^?]*\?/i.test(
      value
    )
  );
}

export function reportsTreatmentPlanSubmission(text = ''): boolean {
  const segments = text
    .replace(/===\s*[^=]+\s*===/g, '\n')
    .replace(/---\s*Reply\s+\d+\s+of\s+\d+\s*---/gi, '\n')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((segment) => ({
      raw: segment,
      text: cleanConversationSentence(segment),
    }))
    .filter((segment) => segment.text);
  return segments.some((segment) => {
    const value = normalizeOperationalText(segment.text);
    if (/\bauth(?:orization)? request\b/.test(value)) return false;
    if (
      /\b(?:will|would|plans?|expects?|scheduled|due|target(?:ed)?)\b.{0,55}\b(?:submitted|sent)\b/.test(
        value
      )
    ) {
      return false;
    }
    if (segment.raw.includes('?') && isTreatmentPlanStatusInquiry(segment.raw)) {
      return false;
    }
    return (
      /\b(?:the provider|provider|bcba|they)\b.{0,30}\b(?:submitted|sent)\b/.test(value) ||
      /\bfound it\b.{0,45}\b(?:submitted|sent)\b/.test(value)
    );
  });
}

export function treatmentPlanRevisionTopics(text = ''): string[] {
  const value = normalizeOperationalText(text);
  const topics = [];
  if (
    /\b(?:baseline data|operational definitions?|target behaviors?|reduction goals?|mastery criteria|function matched replacement goals?)\b/.test(
      value
    )
  ) {
    topics.push('behavior definitions, baselines, and reduction goals');
  }
  if (
    /\b(?:acquisition goals?|objectively measurable|response and scoring|scoring system|measurable goals?)\b/.test(
      value
    )
  ) {
    topics.push('measurable acquisition goals and scoring');
  }
  if (/\b(?:overall progress summary|program summary)\b/.test(value)) {
    topics.push('an overall progress summary');
  }
  if (
    /\b(?:clinical rationale|requested hours|service mix|behavioral needs|skill deficits)\b/.test(
      value
    )
  ) {
    topics.push('clinical rationale for the requested services');
  }
  if (/\b(?:transition plan|discharge plan)\b/.test(value)) {
    topics.push('the transition or discharge plan');
  }
  return topics;
}
