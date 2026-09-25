import { requireContract as check } from './connector-checkpoint.js';

export interface GoogleReadAssertion {
  readonly kind: string;
  readonly sheetId: number;
  readonly title: string;
  readonly startRowIndex?: unknown;
  readonly endRowIndex?: unknown;
  readonly startColumnIndex?: unknown;
  readonly endColumnIndex?: unknown;
  readonly rowCount?: unknown;
  readonly columnCount?: unknown;
}
export type GoogleReadRange<T extends GoogleReadAssertion> = Omit<T, 'endRowIndex' | 'rowCount'> & {
  endRowIndex?: unknown;
  rowCount?: unknown;
};
export interface GoogleAssertionReadGroup<T extends GoogleReadAssertion> {
  readonly range: GoogleReadRange<T>;
  readonly assertions: T[];
}
/** Only consecutive adjacent value assertions merge; no unasserted cells enter their union. */
export function planGoogleAssertionReads<T extends GoogleReadAssertion>(
  assertions: readonly T[],
  maxCells = 10_000
): GoogleAssertionReadGroup<T>[] {
  check(
    Number.isSafeInteger(maxCells) && maxCells >= 1 && maxCells <= 10_000,
    'Invalid Google read coalescing bound'
  );
  const groups: GoogleAssertionReadGroup<T>[] = [];
  for (const expected of assertions) {
    const previous = groups.at(-1);
    const range = previous?.range;
    const cells =
      (Number(expected.endRowIndex ?? Number.NaN) -
        Number(range?.startRowIndex ?? expected.startRowIndex ?? Number.NaN)) *
      (Number(expected.endColumnIndex ?? Number.NaN) -
        Number(expected.startColumnIndex ?? Number.NaN));
    if (
      previous !== undefined &&
      expected.kind === 'values' &&
      range?.kind === 'values' &&
      range.sheetId === expected.sheetId &&
      range.title === expected.title &&
      range.startColumnIndex === expected.startColumnIndex &&
      range.endColumnIndex === expected.endColumnIndex &&
      range.endRowIndex === expected.startRowIndex &&
      cells > 0 &&
      cells <= maxCells
    ) {
      range.endRowIndex = expected.endRowIndex;
      if (range.rowCount !== undefined)
        range.rowCount =
          Number(range.endRowIndex ?? Number.NaN) - Number(range.startRowIndex ?? Number.NaN);
      previous.assertions.push(expected);
    } else groups.push({ range: { ...expected }, assertions: [expected] });
  }
  return groups;
}
