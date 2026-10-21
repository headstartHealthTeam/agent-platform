import { z } from 'zod';

/** Keep complete schemas compact without relaxing the strict application JSON Schema reader. */
export const credentialingJsonSchema = (schema: z.ZodType): z.core.JSONSchema.BaseSchema =>
  z.toJSONSchema(schema, {
    reused: 'ref',
    override: ({ jsonSchema }) => {
      // Zod may put a pattern beside a shared string $ref. Ajv strictTypes requires the local
      // type too, even though the referenced schema already constrains the value to a string.
      if (typeof jsonSchema.pattern === 'string') jsonSchema.type = 'string';
    },
  });
