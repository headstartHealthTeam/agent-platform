/** Preserve the approved command parser: flags, last duplicate wins, ignored positionals. */
export function parseIntakeArguments(
  argv: readonly string[]
): Readonly<Record<string, string | boolean>> {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv.at(index);
    if (!value?.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) Reflect.set(result, value.slice(2), true);
    else {
      Reflect.set(result, value.slice(2), next);
      index++;
    }
  }
  return result;
}
export function intakeStringArgument(
  args: Readonly<Record<string, string | boolean>>,
  key: string,
  usage: string
): string {
  const value: unknown = Reflect.get(args, key);
  if (typeof value !== 'string' || !value) throw new Error(usage);
  return value;
}
export function optionalIntakeArgument(
  args: Readonly<Record<string, string | boolean>>,
  key: string
): string | undefined {
  const value: unknown = Reflect.get(args, key);
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`--${key} requires a value`);
  return value;
}
