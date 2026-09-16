import fs from 'node:fs';

import { z } from 'zod';

import {
  credentialingArtifactInputSchema,
  credentialingArtifactOutputSchema,
} from './preparation-contracts.js';

for (const [name, schema] of [
  ['input', credentialingArtifactInputSchema],
  ['output', credentialingArtifactOutputSchema],
] as const) {
  fs.writeFileSync(
    new URL(`../schemas/${name}.schema.json`, import.meta.url),
    `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`
  );
}
