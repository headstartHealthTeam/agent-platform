import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { RuntimeCommand } from '../runtime-packaging.js';
import { securityPreflight, verifySecurityPreflight } from '../security-preflight.js';

const sha = 'a'.repeat(40);
const now = (): Date => new Date('2026-09-30T00:00:00.000Z');
const command: RuntimeCommand = async (_name, args) => (args.includes('rev-parse') ? sha : '');

describe('fresh exact-source security evidence', () => {
  it('binds clean source and lockfile, enforcing age, shape and clock direction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'security-preflight-'));
    try {
      await writeFile(join(root, 'pnpm-lock.yaml'), 'synthetic lock');
      const receipt = await securityPreflight(root, sha, command, now);
      expect(await verifySecurityPreflight(receipt, root, sha, command, now)).toEqual(receipt);
      expect(receipt).toMatchObject({
        threshold: 'moderate',
        production: 'passed',
        allDependencies: 'passed',
      });
      await expect(
        verifySecurityPreflight(
          receipt,
          root,
          sha,
          command,
          () => new Date(now().getTime() + 900001)
        )
      ).rejects.toThrow('stale');
      await expect(
        verifySecurityPreflight(receipt, root, sha, command, () => new Date(now().getTime() - 1))
      ).rejects.toThrow('stale');
      await expect(
        verifySecurityPreflight(receipt, root, 'b'.repeat(40), command, now)
      ).rejects.toThrow('stale');
      await expect(
        verifySecurityPreflight({ ...receipt, production: 'failed' }, root, sha, command, now)
      ).rejects.toThrow();
      await expect(
        verifySecurityPreflight(
          { ...receipt, sourceRevision: 'b'.repeat(40) },
          root,
          sha,
          command,
          now
        )
      ).rejects.toThrow('stale');
      await writeFile(join(root, 'pnpm-lock.yaml'), 'different lock');
      await expect(verifySecurityPreflight(receipt, root, sha, command, now)).rejects.toThrow(
        'stale'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('attempts both audits and fails closed for vulnerabilities or registry failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'security-preflight-'));
    try {
      await writeFile(join(root, 'pnpm-lock.yaml'), 'synthetic lock');
      const invocations: string[][] = [];
      const failing: RuntimeCommand = async (name, args) => {
        if (args.includes('audit')) {
          invocations.push([...args]);
          throw new Error('private registry detail');
        }
        return command(name, args, root);
      };
      await expect(securityPreflight(root, sha, failing, now)).rejects.toThrow(
        'production, all dependencies'
      );
      expect(invocations).toEqual([
        ['pnpm', 'audit', '--prod', '--audit-level', 'moderate'],
        ['pnpm', 'audit', '--audit-level', 'moderate'],
      ]);
      await expect(securityPreflight(root, 'b'.repeat(40), command, now)).rejects.toThrow(
        'Unexpected'
      );
      await expect(securityPreflight(root, sha, async () => 'main', now)).rejects.toThrow(
        'Invalid source'
      );
      const dirty: RuntimeCommand = async (name, args) =>
        args.includes('status') ? ' M package.json' : command(name, args, root);
      await expect(securityPreflight(root, sha, dirty, now)).rejects.toThrow('clean');
      let revisions = 0;
      const changed: RuntimeCommand = async (name, args) =>
        args.includes('rev-parse')
          ? ++revisions === 1
            ? sha
            : 'b'.repeat(40)
          : command(name, args, root);
      await expect(securityPreflight(root, sha, changed, now)).rejects.toThrow('changed during');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('retains blocking CI, scheduled detection and grouped security updates', async () => {
    const ci = await readFile(new URL('../../.github/workflows/qa.yml', import.meta.url), 'utf8');
    const watch = await readFile(
      new URL('../../.github/workflows/dependency-audit.yml', import.meta.url),
      'utf8'
    );
    const updates = await readFile(
      new URL('../../.github/dependabot.yml', import.meta.url),
      'utf8'
    );
    expect(ci).toContain('needs: [quality, dependency-audit, hosted-runtime]');
    expect(ci).toContain('pnpm credentialing:release --expected-source');
    for (const workflow of [ci, watch]) {
      expect(workflow).toContain('pnpm audit --prod --audit-level moderate');
      expect(workflow).toContain('pnpm audit --audit-level moderate');
      expect(workflow).not.toContain('continue-on-error');
    }
    expect(watch).toContain("cron: '23 10 * * *'");
    expect(watch).toContain('contents: read');
    expect(updates).toContain('applies-to: security-updates');
  });

  it('exercises patched transitive address-family and bounded-diagnostic behavior', () => {
    const script = `const { createRequire } = require('node:module');
      const mcp = createRequire(require('node:path').resolve('packages/headstart-mcp-data/package.json'));
      const sdk = createRequire(mcp.resolve('@modelcontextprotocol/sdk/client/index.js'));
      const rate = createRequire(sdk.resolve('express-rate-limit'));
      const { Address4, Address6 } = rate('ip-address');
      const assert = require('node:assert/strict');
      assert.equal(new Address6('a00::1').isInSubnet(new Address4('10.0.0.0/8')), false);
      assert.equal(new Address4('32.0.0.1').isHostInSubnet(new Address6('2000::/3')), false);
      assert.equal(new Address4('10.0.0.1').isInSubnet(new Address4('10.0.0.0/8')), true);
      assert.throws(() => new Address6('!'.repeat(10000)), (error) =>
        /at most 45 characters/.test(error.message) && error.parseMessage === undefined);
      process.stdout.write('patched address behavior verified');`;
    expect(
      execFileSync(process.execPath, ['-e', script], {
        cwd: new URL('../..', import.meta.url),
        encoding: 'utf8',
        timeout: 15000,
      })
    ).toBe('patched address behavior verified');
  }, 30000);
});
