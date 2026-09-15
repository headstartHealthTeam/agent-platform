import { describe, expect, it, vi } from 'vitest';

import { readCredential } from './credential.js';

const reference = {
  account: 'headstarthealth.1password.com' as const,
  expectedEmail: 'synthetic@example.com',
  vault: 'vault-synthetic',
  item: 'item-synthetic',
  field: 'credential',
};
describe('1Password credential boundary', () => {
  it('checks the explicitly selected account identity before reading the item', async () => {
    const command = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ email: reference.expectedEmail }))
      .mockResolvedValueOnce(
        JSON.stringify({ fields: [{ id: 'credential', value: 'synthetic-only' }] })
      );
    expect(await readCredential(reference, command)).toBe('synthetic-only');
    expect(command.mock.calls[0]).toEqual([
      ['user', 'get', '--me', '--account', reference.account, '--format', 'json'],
    ]);
    expect(command.mock.calls[1]).toEqual([
      [
        'item',
        'get',
        reference.item,
        '--vault',
        reference.vault,
        '--account',
        reference.account,
        '--format',
        'json',
      ],
    ]);
  });
  it('stops before item access for another identity', async () => {
    const command = vi.fn().mockResolvedValue(JSON.stringify({ email: 'different@example.com' }));
    await expect(readCredential(reference, command)).rejects.toThrow('identity mismatch');
    expect(command).toHaveBeenCalledTimes(1);
  });
  it.each([
    {},
    { fields: [] },
    { fields: [{ id: 'credential', value: '' }] },
    {
      fields: [
        { id: 'credential', value: 'one' },
        { id: 'two', label: 'credential', value: 'two' },
      ],
    },
  ])('rejects malformed or ambiguous credentials', async (item) => {
    const command = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ email: reference.expectedEmail }))
      .mockResolvedValueOnce(JSON.stringify(item));
    await expect(readCredential(reference, command)).rejects.toThrow('Credential unavailable');
  });
  it('suppresses raw subprocess exceptions', async () => {
    await expect(
      readCredential(reference, async () => {
        throw new Error('synthetic-secret-error');
      })
    ).rejects.not.toThrow('synthetic-secret-error');
  });
});
