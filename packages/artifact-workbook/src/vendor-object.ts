/** Narrow only the operation being used; an unused vendor member is not a readiness gate. */
function object(value: unknown): object {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
    throw new TypeError('Artifact workbook operation requires an object');
  return value;
}
export function member(value: unknown, key: string): unknown {
  return Reflect.get(object(value), key);
}
export function assign(value: unknown, key: string, next: unknown): void {
  if (!Reflect.set(object(value), key, next))
    throw new TypeError('Artifact workbook property is not writable');
}
export function assignMembers(value: unknown, values: object): void {
  for (const [key, next] of Object.entries(values)) assign(value, key, next);
}
export function invoke(value: unknown, method: string, args: readonly unknown[] = []): unknown {
  const operation = member(value, method);
  if (typeof operation !== 'function')
    throw new TypeError('Artifact workbook operation is unavailable');
  return Reflect.apply(operation, value, args);
}
