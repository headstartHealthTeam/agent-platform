/** Existing sentence accounting; a count is not a maximum-length policy. */
export function narrativeSentenceCount(value: unknown = ''): number {
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
}
