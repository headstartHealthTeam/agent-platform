export function unicodeLength(value: unknown = ''): number {
  return Array.from(String(value)).length;
}

export function unicodeSlice(value: unknown = '', start = 0, end?: number): string {
  return Array.from(String(value)).slice(start, end).join('');
}

export function truncateWithEllipsis(value: unknown = '', max = 500): string {
  const text = String(value);
  return unicodeLength(text) > max ? `${unicodeSlice(text, 0, Math.max(0, max - 3))}...` : text;
}
