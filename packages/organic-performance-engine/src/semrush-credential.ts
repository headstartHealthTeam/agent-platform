import spawn from 'cross-spawn';
import { z } from 'zod';

export const semrushCredentialSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('environment'), variable: z.string().regex(/^[A-Z][A-Z0-9_]+$/) })
    .strict(),
  z.object({ type: z.literal('codex-mcp'), server: z.literal('semrush-mcp') }).strict(),
]);

function readCodexMcp(): Promise<string> {
  return new Promise((resolve, reject) => {
    // This optional host binding has fixed arguments. Support codex.cmd without shell:true or
    // interpolating profile values into a shell command; never surface its credential-bearing output.
    const child = spawn('codex', ['mcp', 'get', 'semrush-mcp', '--json'], {
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const accept = (chunk: Buffer): boolean => {
      bytes += chunk.byteLength;
      if (bytes <= 1_000_000) return true;
      child.kill();
      reject(new Error('Credential command output exceeded its limit'));
      return false;
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      if (accept(chunk)) chunks.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      accept(chunk);
    });
    child.on('error', () => {
      reject(new Error('Credential command could not start'));
    });
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'));
      else reject(new Error('Credential command failed'));
    });
  });
}

export async function resolveSemrushCredential(
  input: z.infer<typeof semrushCredentialSchema>
): Promise<string> {
  if (input.type === 'environment') {
    const value = Object.entries(process.env).find(([key]) => key === input.variable)?.[1];
    if (!value) throw new Error('Configured Semrush credential environment variable is absent');
    return value;
  }
  try {
    const parsed = z
      .object({
        enabled: z.literal(true),
        transport: z.object({ env: z.object({ SEMRUSH_API_KEY: z.string().min(1) }) }),
      })
      .parse(JSON.parse(await readCodexMcp()));
    return parsed.transport.env.SEMRUSH_API_KEY;
  } catch {
    throw new Error('The configured Semrush MCP credential could not be resolved');
  }
}
