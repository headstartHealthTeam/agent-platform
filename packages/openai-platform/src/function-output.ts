import {
  AGENT_FUNCTION_CONTENT_LIMIT,
  AGENT_FUNCTION_PAYLOAD_LIMIT,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

// Official Agents API InputContentParam, deliberately limited to text and inline browser images.
// Do not make the provider fetch arbitrary URLs or serialize an image into a text-only result.
const inlineImage = z
  .string()
  .max(AGENT_FUNCTION_CONTENT_LIMIT)
  .refine((value) => {
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match?.[1]) return false;
    const bytes = Buffer.from(match[1], 'base64');
    return bytes.length > 0 && bytes.toString('base64') === match[1];
  });

export const functionOutput = z.union([
  // Preserve existing application-text compatibility; the visual extension has its own budget.
  z.string().refine((value) => Buffer.byteLength(value) <= AGENT_FUNCTION_PAYLOAD_LIMIT),
  z
    .array(
      z.discriminatedUnion('type', [
        z
          .object({
            type: z.literal('input_text'),
            text: z.string().max(AGENT_FUNCTION_CONTENT_LIMIT),
          })
          .strict(),
        z.object({ type: z.literal('input_image'), image_url: inlineImage }).strict(),
      ])
    )
    .min(1)
    .max(16)
    .refine((value) => Buffer.byteLength(JSON.stringify(value)) <= AGENT_FUNCTION_CONTENT_LIMIT),
]);
