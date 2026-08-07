import {
  Codex,
  type Input,
  type RunStreamedResult,
  type ThreadEvent,
  type ThreadOptions,
  type TurnOptions,
  type Usage,
} from '@openai/codex-sdk';

export interface CodexTurnRequest {
  prompt: string;
  outputSchema: Record<string, unknown>;
  workingDirectory: string;
  model: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  sandbox: 'read-only' | 'workspace-write';
  networkAccess: 'disabled' | 'allowlisted';
  timeoutSeconds: number;
  emitEvents: boolean;
}

export interface CodexTurnResult {
  threadId: string;
  finalResponse: string;
  usage: Usage | null;
}

export interface CodexEventSink {
  emit(event: ThreadEvent): Promise<void>;
}

export interface CodexTurnExecutor {
  execute(request: CodexTurnRequest): Promise<CodexTurnResult>;
}

export interface CodexThreadClient {
  runStreamed(input: Input, options?: TurnOptions): Promise<RunStreamedResult>;
}

export interface CodexClient {
  startThread(options?: ThreadOptions): CodexThreadClient;
}

export interface CodexSdkExecutorOptions {
  environment: Record<string, string>;
  eventSink?: CodexEventSink;
  client?: CodexClient;
  codexPathOverride?: string;
}

const parseStream = async (
  events: AsyncGenerator<ThreadEvent>,
  eventSink: CodexEventSink | undefined,
  emitEvents: boolean
): Promise<CodexTurnResult> => {
  let threadId: string | undefined;
  let finalResponse: string | undefined;
  let usage: Usage | null = null;

  for await (const event of events) {
    if (emitEvents && eventSink) {
      await eventSink.emit(event);
    }

    if (event.type === 'thread.started') {
      threadId = event.thread_id;
    } else if (event.type === 'item.completed' && event.item.type === 'agent_message') {
      finalResponse = event.item.text;
    } else if (event.type === 'turn.completed') {
      usage = event.usage;
    } else if (event.type === 'turn.failed') {
      throw new Error(event.error.message);
    } else if (event.type === 'error') {
      throw new Error(event.message);
    }
  }

  if (!threadId || finalResponse === undefined) {
    throw new Error('Codex stream ended without a thread identifier and final response.');
  }

  return { threadId, finalResponse, usage };
};

export class CodexSdkExecutor implements CodexTurnExecutor {
  private readonly codex: CodexClient;
  private readonly eventSink: CodexEventSink | undefined;

  public constructor(options: CodexSdkExecutorOptions) {
    this.codex =
      options.client ??
      new Codex({
        env: options.environment,
        ...(options.codexPathOverride ? { codexPathOverride: options.codexPathOverride } : {}),
      });
    this.eventSink = options.eventSink;
  }

  public async execute(request: CodexTurnRequest): Promise<CodexTurnResult> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, request.timeoutSeconds * 1_000);

    try {
      const thread = this.codex.startThread({
        workingDirectory: request.workingDirectory,
        model: request.model,
        ...(request.reasoningEffort ? { modelReasoningEffort: request.reasoningEffort } : {}),
        sandboxMode: request.sandbox,
        networkAccessEnabled: request.networkAccess === 'allowlisted',
        approvalPolicy: 'never',
      });
      const streamed = await thread.runStreamed(request.prompt, {
        outputSchema: request.outputSchema,
        signal: abortController.signal,
      });

      return await parseStream(streamed.events, this.eventSink, request.emitEvents);
    } finally {
      clearTimeout(timeout);
    }
  }
}
