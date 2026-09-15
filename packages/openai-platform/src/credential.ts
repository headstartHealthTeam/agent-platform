import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import { credentialSchema, type CredentialReference } from './config.js';

const exec = promisify(execFile);
export type SecretCommand = (args: readonly string[]) => Promise<string>;

// Output is captured only inside the consuming process. Never attach child-process errors.
export const runOnePassword: SecretCommand = async (args) => {
  try {
    const { stdout } = await exec('op', [...args], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'],
        HOME: process.env['HOME'],
        USER: process.env['USER'],
        TMPDIR: process.env['TMPDIR'],
        OP_BIOMETRIC_UNLOCK_ENABLED: 'true',
      },
    });
    return stdout;
  } catch {
    throw new Error('1Password CLI access failed; check desktop CLI integration.');
  }
};

export async function readCredential(
  reference: CredentialReference,
  command: SecretCommand = runOnePassword
): Promise<string> {
  try {
    const ref = credentialSchema.parse(reference);
    const suffix = ['--account', ref.account, '--format', 'json'];
    const identity: unknown = JSON.parse(await command(['user', 'get', '--me', ...suffix]));
    const user = z.object({ email: z.string() }).parse(identity);
    if (user.email !== ref.expectedEmail) {
      throw new Error('identity mismatch');
    }
    const raw: unknown = JSON.parse(
      await command(['item', 'get', ref.item, '--vault', ref.vault, ...suffix])
    );
    const item = z
      .object({
        fields: z.array(
          z.object({ id: z.string(), label: z.string().optional(), value: z.string().optional() })
        ),
      })
      .parse(raw);
    const fields = item.fields.filter(
      (field) => field.id === ref.field || field.label === ref.field
    );
    const value = fields[0]?.value;
    if (fields.length !== 1 || value === undefined || value.trim().length === 0) {
      throw new Error('missing credential');
    }
    return value;
  } catch {
    throw new Error(
      'Credential unavailable or Headstart identity mismatch; no secret values emitted.'
    );
  }
}
