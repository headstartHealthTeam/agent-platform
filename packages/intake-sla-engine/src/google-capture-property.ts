/** Read only a consumed field; do not enumerate or validate unrelated capture metadata. */
export function captureProperty(value: unknown, key: string): unknown {
  if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
    const result: unknown = Reflect.get(value, key);
    return result;
  }
  return undefined;
}
