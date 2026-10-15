import { z } from 'zod';

export const savedOptionalText = z.string().nullish();
export const savedFieldsSchema = z.record(z.string(), z.unknown());
export function savedFields(value: unknown): Record<string, unknown> {
  const result = savedFieldsSchema.safeParse(value);
  return result.success ? result.data : {};
}
/** Source status is separate from payload admission; decoding does not create a search. */
export const savedSourceCheckSchema = z.looseObject({
  unsupported: z.boolean().nullish(),
  blocked: z.boolean().nullish(),
  timedOut: z.boolean().nullish(),
  error: savedOptionalText,
  searchedAt: savedOptionalText,
  collectedAt: savedOptionalText,
  checkedAt: savedOptionalText,
});
