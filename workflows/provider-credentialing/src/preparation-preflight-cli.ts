import { runPreparationPreflight } from './preparation-preflight.js';

const reply = runPreparationPreflight(process.argv.slice(2));
// Do not echo the snapshot/proposal or its source bodies into the tool transcript.
process.stdout.write(
  `${JSON.stringify(reply.ok ? { ok: true, readiness: reply.value.readiness } : reply)}\n`
);
process.exitCode = reply.ok ? 0 : 1;
