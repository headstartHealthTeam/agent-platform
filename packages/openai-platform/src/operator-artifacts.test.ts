import { describe, expect, it, vi } from 'vitest';

import { HostedArtifactError } from './hosted-artifact-error.js';
import { readSchema } from './operations.js';
import { OperatorRuntimePort } from './operator-runtime.js';
import { fingerprint, type OpenAIPlatform } from './platform.js';

const target = { organizationId: 'org-synthetic', projectId: 'proj_synthetic' };
const binding = {
  sessionId: 'session',
  turnId: 'root',
  target: fingerprint(target),
  workflowRevision: 'r1',
};
const request = { turnId: 'root', path: '/workspace/outputs/evidence.pdf', maxBytes: 100 };

function fixture(
  status: string,
  requestedTurn = 'root',
  hasTransport = true
): {
  port: OperatorRuntimePort;
  download: ReturnType<typeof vi.fn<OpenAIPlatform['readHostedArtifact']>>;
} {
  const download = vi.fn<OpenAIPlatform['readHostedArtifact']>().mockResolvedValue({
    id: 'artifact',
    turnId: 'root',
    path: request.path,
    bytes: new Uint8Array([1]),
  });
  const read = vi.fn<OpenAIPlatform['read']>(async (input) => {
    const operation = readSchema.parse(input);
    return {
      fingerprint: 'synthetic',
      data:
        operation.operation === 'sessions.get'
          ? { id: binding.sessionId, metadata: { workflow_revision: 'r1' } }
          : {
              data:
                operation.operation === 'sessions.turns' && operation.query.after
                  ? []
                  : [
                      { id: 'root', session_id: binding.sessionId, subagent_id: null, status },
                      ...(requestedTurn === 'child'
                        ? [
                            {
                              id: 'child',
                              session_id: binding.sessionId,
                              subagent_id: 'worker',
                              status: 'completed',
                            },
                          ]
                        : []),
                    ],
              has_more: false,
            },
    };
  });
  return {
    port: new OperatorRuntimePort(
      {
        read,
        apply: vi.fn(),
        preflight: vi.fn(),
        openOperatorObservation: vi.fn(),
        ...(hasTransport ? { readHostedArtifact: download } : {}),
      },
      target
    ),
    download,
  };
}

describe('artifact root provenance gates', () => {
  it('downloads only after a verified completed root', async () => {
    const { port, download } = fixture('completed');
    expect(await port.artifactTurnStatus(binding, 'root')).toBe('completed');
    await port.readArtifact(binding, request);
    expect(download).toHaveBeenCalledWith(binding.sessionId, request);
    port.close();
  });
  it.each(['queued', 'in_progress', 'waiting'])(
    'keeps %s retryable and never reads bytes',
    async (status) => {
      const { port, download } = fixture(status);
      expect(await port.artifactTurnStatus(binding, 'root')).toBe('pending');
      await expect(port.readArtifact(binding, request)).rejects.toThrow('has not completed');
      expect(download).not.toHaveBeenCalled();
      port.close();
    }
  );
  it.each(['failed', 'cancelled'])(
    'rejects %s permanently and never reads bytes',
    async (status) => {
      const { port, download } = fixture(status);
      expect(await port.artifactTurnStatus(binding, 'root')).toBe(status);
      await expect(port.readArtifact(binding, request)).rejects.toMatchObject({
        code: 'artifact-identity',
      });
      expect(download).not.toHaveBeenCalled();
      port.close();
    }
  );
  it.each(['child', 'missing'])('rejects a non-root or absent turn: %s', async (turnId) => {
    const { port, download } = fixture('completed', turnId);
    await expect(port.artifactTurnStatus(binding, turnId)).rejects.toMatchObject({
      code: 'artifact-identity',
    });
    await expect(port.readArtifact(binding, { ...request, turnId })).rejects.toMatchObject({
      code: 'artifact-identity',
    });
    expect(download).not.toHaveBeenCalled();
    port.close();
  });
  it('reports the wrong target as a setup error without artifact-correction feedback', async () => {
    const { port, download } = fixture('completed');
    const result = port.readArtifact({ ...binding, target: 'wrong' }, request);
    await expect(result).rejects.toThrow('Wrong runtime target');
    await expect(result).rejects.not.toBeInstanceOf(HostedArtifactError);
    expect(download).not.toHaveBeenCalled();
    port.close();
  });
  it('reports a missing artifact transport as a setup error without artifact-correction feedback', async () => {
    const { port, download } = fixture('completed', 'root', false);
    const result = port.readArtifact(binding, request);
    await expect(result).rejects.toThrow('Hosted artifact transport is not configured');
    await expect(result).rejects.not.toBeInstanceOf(HostedArtifactError);
    expect(download).not.toHaveBeenCalled();
    port.close();
  });
  it.each([
    { ...binding, workflowRevision: 'other' },
    { ...binding, turnId: 'child' },
    { ...binding, sessionId: 'other' },
  ])('rejects mismatched session/workflow/root provenance permanently', async (mismatch) => {
    const { port, download } = fixture('completed');
    await expect(port.readArtifact(mismatch, request)).rejects.toMatchObject({
      code: 'artifact-identity',
    });
    expect(download).not.toHaveBeenCalled();
    port.close();
  });
});
