import { describe, expect, it } from 'vitest';

import { agentLaunchDiagnostic } from './launch-diagnostic.js';

describe('safe launch diagnostics', () => {
  const http = { operation: 'sessions.create', kind: 'http' };
  it.each([null, false, [], {}, { ...http, operation: 'sessions.send' }, { ...http, kind: 'bad' }])(
    'rejects a malformed or unrelated diagnostic: %s',
    (value) => {
      expect(agentLaunchDiagnostic(value)).toBeUndefined();
    }
  );
  it.each([undefined, null, '400', 0, 600, 400.5, Number.NaN, Infinity])(
    'never coerces an invalid HTTP status: %s',
    (status) => {
      expect(agentLaunchDiagnostic({ ...http, status })).toEqual(http);
    }
  );
  it.each([100, 400, 424, 429, 500, 599])('retains a valid HTTP status: %s', (status) => {
    expect(agentLaunchDiagnostic({ ...http, status })).toEqual({ ...http, status });
  });
  it('is idempotent and drops all additional fields, bodies, causes and headers', () => {
    const result = agentLaunchDiagnostic({
      ...http,
      status: 429,
      code: 'insufficient_quota',
      type: 'insufficient_quota',
      parameter: 'agent.tools[12].transport.authorization',
      message: 'invented-private-message',
      headers: { authorization: 'invented-private-token' },
      cause: { body: 'invented-private-evidence' },
    });
    expect(result).toEqual({
      ...http,
      status: 429,
      code: 'insufficient_quota',
      type: 'insufficient_quota',
      parameter: 'agent.tools.transport.authorization',
    });
    expect(agentLaunchDiagnostic(result)).toEqual(result);
  });
  it.each(['timeout', 'connection', 'unclassified'])(
    'drops all provider fields from non-HTTP %s errors',
    (kind) => {
      const input = { ...http, kind, status: 500, code: 'server_error', type: 'api_error' };
      expect(agentLaunchDiagnostic(input)).toEqual({ operation: 'sessions.create', kind });
    }
  );
  it.each(['invented-private-value', {}, 400, 'x'.repeat(161), 'agent.tools[9999].parameters'])(
    'replaces all unrecognized strings or shapes: %s',
    (value) => {
      const result = agentLaunchDiagnostic({ ...http, code: value, type: value, parameter: value });
      expect(result).toEqual({
        ...http,
        code: 'unrecognized',
        type: 'unrecognized',
        parameter: 'unrecognized',
      });
      expect(agentLaunchDiagnostic(result)).toEqual(result);
    }
  );
  it('omits missing and null provider metadata', () => {
    expect(
      agentLaunchDiagnostic({ ...http, code: null, type: undefined, parameter: null })
    ).toEqual(http);
  });
});
