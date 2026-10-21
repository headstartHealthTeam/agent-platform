import fs from 'node:fs';

import { credentialingJsonSchema } from './json-schema.js';
import {
  syntheticArtifactInputSchema,
  productionReadInputSchema,
  credentialingArtifactOutputSchema,
} from './preparation-contracts.js';

for (const [name, schema] of [
  ['input', syntheticArtifactInputSchema],
  ['production-read-input', productionReadInputSchema],
  ['output', credentialingArtifactOutputSchema],
] as const) {
  fs.writeFileSync(
    new URL(`../schemas/${name}.schema.json`, import.meta.url),
    // Shared definitions preserve the canonical constraints without repeating every citation
    // and scope in the installed files; keep the existing hosted-definition size bound.
    `${JSON.stringify(credentialingJsonSchema(schema), null, 2)}\n`
  );
}
