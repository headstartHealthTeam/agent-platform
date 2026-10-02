import type { IdentityValue } from './provider-identity-types.js';

export function normalizeClientName(value: IdentityValue = ''): string {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function cell(values: readonly number[], index: number): number {
  const value = values.at(index);
  if (value === undefined) throw new Error('Missing name-distance matrix cell');
  return value;
}
export function nameEditDistance(
  left = '',
  right = '',
  normalize: (value: string) => string = normalizeClientName
): number {
  const a = normalize(left);
  const b = normalize(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    const current = [row];
    for (let column = 1; column <= b.length; column++)
      current.push(
        Math.min(
          cell(current, column - 1) + 1,
          cell(previous, column) + 1,
          cell(previous, column - 1) + (a.at(row - 1) === b.at(column - 1) ? 0 : 1)
        )
      );
    previous.splice(0, previous.length, ...current);
  }
  return cell(previous, b.length);
}
