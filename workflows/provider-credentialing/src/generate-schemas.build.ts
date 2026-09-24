import fs from 'node:fs';

import { z } from 'zod';

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
    `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`
  );
}
