import { z } from 'zod';

/** These field-only schemas validate without rewriting source order or nested metadata references. */
export function preserveCollectionRecord<T>(schema: z.ZodType<T>): z.ZodType<T> {
  return z.custom<T>((value: unknown): value is T => schema.safeParse(value).success);
}

export interface StructuredCollectionArtifacts {
  read(name: string): Promise<unknown>;
  write(name: string, value: unknown): Promise<void>;
}

export async function savedCollectionRecords<T>(
  artifacts: StructuredCollectionArtifacts,
  name: string,
  schema: z.ZodType<T>
): Promise<T[]> {
  const value = await artifacts.read(name);
  return z.array(preserveCollectionRecord(schema)).parse(value === undefined ? [] : value);
}
