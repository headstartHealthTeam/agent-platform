/** UTF-16 code-unit order, independent of process locale or ICU collation version. */
export function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
