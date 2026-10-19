import type {
  AgentPreparedSessionStartResult,
  AgentSessionReceipt,
  AgentWorkspaceFile,
  AgentWorkspaceFileReceipt,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import type { Target } from './config.js';
import { observeEnvironment } from './environment-observation.js';
import { requireInferenceAuthority, type InferenceAuthority } from './inference-authority.js';
import { actionSchema } from './operations.js';
import { fingerprint, planAction, type OpenAIPlatform } from './platform.js';
import { visitSessionHistory } from './session-history.js';

type Platform = Pick<OpenAIPlatform, 'read' | 'apply'> &
  Partial<Pick<OpenAIPlatform, 'stagePreparedSessionFile'>>;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const receiptSchema = z
  .object({
    sessionId: id,
    target: id,
    workflowRevision: id,
    requestId: z.uuid(),
  })
  .strict();

/** Transport only. Application owns restoration inventory, serialization, original authority,
 * dispatch journals and uncertain-outcome reconciliation. No automatic create, retry or reset. */
export class PreparedSessionPort {
  constructor(
    private readonly platform: Platform,
    private readonly target: Target,
    private readonly authority: InferenceAuthority
  ) {}

  private async ready(value: AgentSessionReceipt): Promise<string> {
    const receipt = receiptSchema.parse(value);
    if (receipt.target !== fingerprint(this.target)) throw new Error('Wrong runtime target');
    const response = await this.platform.read({ operation: 'sessions.get', id: receipt.sessionId });
    z.object({
      id: z.literal(receipt.sessionId),
      status: z.literal('idle'),
      metadata: z.object({
        workflow_revision: z.literal(receipt.workflowRevision),
        launch_request: z.literal(receipt.requestId),
        deferred_input: z.literal(receipt.requestId),
      }),
    }).parse(response.data);
    await visitSessionHistory(this.platform, receipt.sessionId, 'sessions.turns', (data) => {
      if (z.array(z.unknown()).parse(data).length)
        throw new Error('Prepared session already has execution history');
    });
    const environment = await observeEnvironment(this.platform, response.data);
    if (environment.type !== 'openai_hosted' || environment.status !== 'connected')
      throw new Error('Prepared workspace is not connected');
    return environment.environmentId;
  }

  async stage(
    receipt: AgentSessionReceipt,
    file: AgentWorkspaceFile,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentWorkspaceFileReceipt> {
    const savedReceipt = receiptSchema.parse(receipt);
    const savedFile = { ...file, bytes: new Uint8Array(file.bytes) };
    const environmentId = await this.ready(savedReceipt);
    if (!savedFile.path.startsWith(`/workspace/restored-context/${savedReceipt.requestId}/`))
      throw new Error('Restoration path belongs to another attempt');
    if (!this.platform.stagePreparedSessionFile)
      throw new Error('Prepared workspace transfer unavailable');
    return this.platform.stagePreparedSessionFile(environmentId, savedFile, async () => {
      await beforeDispatch();
      if ((await this.ready(savedReceipt)) !== environmentId)
        throw new Error('Prepared workspace changed before transfer');
    });
  }

  async start(
    value: AgentSessionReceipt,
    input: string,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentPreparedSessionStartResult> {
    const dispatch = { crossed: false };
    try {
      const receipt = receiptSchema.parse(value);
      const action = actionSchema.parse({
        operation: 'sessions.send',
        id: receipt.sessionId,
        input,
        idempotencyKey: `initial-${receipt.requestId}`,
      });
      await this.ready(receipt);
      await this.platform.apply(
        action,
        {
          apply: true,
          allowBillable: true,
          digest: planAction(this.target, action).digest,
        },
        {
          beforeDispatch: async () => {
            await requireInferenceAuthority(this.authority, {
              operation: 'prepared-start',
              receipt,
            });
            await beforeDispatch();
            await requireInferenceAuthority(this.authority, {
              operation: 'prepared-start',
              receipt,
            });
            await this.ready(receipt);
            dispatch.crossed = true;
          },
        }
      );
      return dispatch.crossed ? { status: 'accepted' } : { status: 'unknown' };
    } catch {
      return { status: dispatch.crossed ? 'unknown' : 'not-attempted' };
    }
  }
}
