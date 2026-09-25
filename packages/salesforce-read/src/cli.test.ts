import { chmod, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { connectSalesforceCli } from './cli.js';

const target = {
  targetOrg: 'synthetic-target with spaces',
  expectedOrgId: '00D000000000001',
  expectedSandbox: false,
};
const result = (records: readonly unknown[]): string =>
  JSON.stringify({ status: 0, result: { done: true, totalSize: records.length, records } });
const organization = { Id: target.expectedOrgId, IsSandbox: false };

describe('Salesforce read binding', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('verifies the Organization before any caller query and keeps scope in argv', async () => {
    const command = vi.fn(async () => result([organization]));
    const reader = await connectSalesforceCli(target, command);
    expect(command).toHaveBeenCalledExactlyOnceWith([
      'data',
      'query',
      '--target-org',
      target.targetOrg,
      '--json',
      '-q',
      'SELECT Id, IsSandbox FROM Organization LIMIT 1',
    ]);
    expect(reader.organization).toEqual({ orgId: target.expectedOrgId, isSandbox: false });
    command.mockResolvedValueOnce(result([{ count: 0 }]));
    expect(
      await reader.query('SELECT count() FROM Account', z.object({ count: z.number() }))
    ).toEqual([{ count: 0 }]);
    expect(command).toHaveBeenLastCalledWith([
      'data',
      'query',
      '--target-org',
      target.targetOrg,
      '--json',
      '-q',
      'SELECT count() FROM Account',
    ]);
    expect(reader.organizationPreflight('salesforce-cli', 'v1')).toMatchObject({
      status: 'ready',
      permissions: ['Organization:read'],
      targetIdentity: { orgId: target.expectedOrgId, isSandbox: false },
    });
  });
  it('rejects wrong and missing orgs before exposing a reader', async () => {
    for (const records of [
      [],
      [organization, organization],
      [{ ...organization, IsSandbox: true }],
    ]) {
      await expect(connectSalesforceCli(target, async () => result(records))).rejects.toThrow(
        /Organization|different org/
      );
    }
  });
  it('supports explicitly selected Tooling reads while keeping Organization verification on data API', async () => {
    const command = vi.fn(async () => result([organization]));
    const reader = await connectSalesforceCli(target, command);
    expect(command).toHaveBeenNthCalledWith(1, [
      'data',
      'query',
      '--target-org',
      target.targetOrg,
      '--json',
      '-q',
      'SELECT Id, IsSandbox FROM Organization LIMIT 1',
    ]);
    command.mockResolvedValueOnce(
      result([{ Name: 'SyntheticClass', Body: 'class SyntheticClass {}' }])
    );
    const query = 'SELECT Name, Body FROM ApexClass';
    expect(
      await reader.query(query, z.object({ Name: z.string(), Body: z.string() }), {
        api: 'tooling',
      })
    ).toEqual([{ Name: 'SyntheticClass', Body: 'class SyntheticClass {}' }]);
    expect(command).toHaveBeenLastCalledWith([
      'data',
      'query',
      '--target-org',
      target.targetOrg,
      '--json',
      '-q',
      query,
      '--use-tooling-api',
    ]);
    command.mockResolvedValueOnce(result([]));
    await reader.query('SELECT Id FROM Account', z.unknown(), { api: 'data' });
    expect(command).toHaveBeenLastCalledWith([
      'data',
      'query',
      '--target-org',
      target.targetOrg,
      '--json',
      '-q',
      'SELECT Id FROM Account',
    ]);
    const count = command.mock.calls.length;
    const invalid: unknown = Reflect.apply(reader.query.bind(reader), undefined, [
      query,
      z.unknown(),
      { api: 'invalid' },
    ]);
    await expect(invalid).rejects.toThrow(/query failed/);
    expect(command).toHaveBeenCalledTimes(count);
  });
  it('sanitizes malformed, incomplete, failed and host-thrown errors', async () => {
    for (const output of [
      'private body',
      JSON.stringify({ status: 1, message: 'private body' }),
      JSON.stringify({ status: 0, result: { done: false, records: [], totalSize: 1 } }),
    ]) {
      await expect(connectSalesforceCli(target, async () => output)).rejects.toThrow(
        /query failed or returned incomplete/
      );
    }
    await expect(
      connectSalesforceCli(target, async () => {
        throw new Error('private credential');
      })
    ).rejects.not.toThrow(/private credential/);
  });
  it('executes the real cross-platform CLI binding using only a synthetic launcher', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'salesforce read fixture-'));
    const script = join(directory, 'sf-fixture.cjs');
    await writeFile(
      script,
      `#!/usr/bin/env node
const argv = process.argv.slice(2);
if (argv[0] !== 'data' || argv[1] !== 'query' || argv[2] !== '--target-org' || argv[4] !== '--json' || argv[5] !== '-q' || process.env.SF_DISABLE_LOG_FILE !== 'true') process.exit(3);
if (process.env.HEADSTART_SF_FIXTURE === 'fail') { process.stderr.write('private credential'); process.exit(1); }
if (process.env.HEADSTART_SF_FIXTURE === 'large') { process.stdout.write('x'.repeat(41 * 1024 * 1024)); }
else {
  const records = argv[6].includes('Organization') ? [{ Id: '00D000000000001', IsSandbox: false }] : [{ label: 'Synthetic 🌱' }];
  const bytes = Buffer.from(JSON.stringify({ status: 0, result: { done: true, totalSize: records.length, records } }));
  const split = bytes.indexOf(Buffer.from('🌱')) + 1;
  process.stdout.write(bytes.subarray(0, split));
  setTimeout(() => process.stdout.write(bytes.subarray(split)), 10);
}
`
    );
    if (process.platform === 'win32')
      await writeFile(
        join(directory, 'sf.cmd'),
        `@"${process.execPath}" "%~dp0sf-fixture.cjs" %*\r\n`
      );
    else {
      await symlink(script, join(directory, 'sf'));
      await chmod(script, 0o755);
    }
    vi.stubEnv('PATH', `${directory}${delimiter}${process.env['PATH'] ?? ''}`);
    const reader = await connectSalesforceCli(target);
    expect(await reader.query('SELECT Name FROM Account', z.object({ label: z.string() }))).toEqual(
      [{ label: 'Synthetic 🌱' }]
    );
    vi.stubEnv('HEADSTART_SF_FIXTURE', 'fail');
    await expect(connectSalesforceCli(target)).rejects.not.toThrow(/private credential/);
    vi.stubEnv('HEADSTART_SF_FIXTURE', 'large');
    await expect(connectSalesforceCli(target)).rejects.toThrow(/query failed/);
    vi.stubEnv('PATH', await mkdtemp(join(tmpdir(), 'missing-salesforce-launcher-')));
    await expect(connectSalesforceCli(target)).rejects.toThrow(/query failed/);
  }, 15_000);
});
