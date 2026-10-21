import { describe, expect, it } from 'vitest';

import { agentResearchTransferDiagnostic } from './public-research.js';

describe('public research transfer diagnostic boundary', () => {
  const http = {
    operation: 'environment-file-transfer',
    phase: 'environment-create',
    transport: 'inline',
    kind: 'http',
  };
  it.each([
    null,
    {},
    [],
    false,
    { ...http, phase: 'private' },
    { ...http, kind: 'private' },
    { ...http, transport: 'private' },
    { ...http, operation: 'private' },
  ])('rejects an unrelated or malformed diagnostic: %s', (value) => {
    expect(agentResearchTransferDiagnostic(value)).toBeUndefined();
  });
  it.each([undefined, null, '429', 0, 600, 400.5, NaN, Infinity])(
    'does not coerce an invalid status: %s',
    (status) => {
      expect(agentResearchTransferDiagnostic({ ...http, status })).toEqual(http);
    }
  );
  it('retains bounded metadata only and is safe to sanitize again after persistence', () => {
    const result = agentResearchTransferDiagnostic({
      ...http,
      status: 429,
      code: 'files_api_rate_limit_exceeded',
      message: 'private',
      headers: { authorization: 'private' },
      cause: { message: 'private' },
      path: '/private',
    });
    expect(result).toEqual({ ...http, status: 429, code: 'files_api_rate_limit_exceeded' });
    expect(agentResearchTransferDiagnostic(result)).toEqual(result);
  });
  it.each(['private', {}, 400, 'x'.repeat(500)])(
    'replaces unknown codes, never truncates them: %s',
    (code) => {
      expect(agentResearchTransferDiagnostic({ ...http, code })).toEqual({
        ...http,
        code: 'unrecognized',
      });
    }
  );
  it.each(['timeout', 'aborted', 'connection', 'invalid-receipt', 'unclassified'])(
    'drops HTTP fields from %s',
    (kind) => {
      expect(
        agentResearchTransferDiagnostic({ ...http, kind, status: 500, code: 'server_error' })
      ).toEqual({ ...http, kind });
    }
  );
});
