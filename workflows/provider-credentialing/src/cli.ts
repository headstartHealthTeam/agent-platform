import { runSyntheticCommand } from './synthetic-tools.js';

try {
  process.stdout.write(`${JSON.stringify(runSyntheticCommand(process.argv.slice(2)), null, 2)}\n`);
} catch {
  process.stderr.write(
    'Synthetic tool call failed; check the documented scenario and read operation.\n'
  );
  process.exitCode = 1;
}
