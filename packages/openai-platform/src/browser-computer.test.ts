import type { BrowserComputerTask } from '@headstart-health/browser-runtime';
import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { runBrowserComputer } from './browser-computer.js';

const observation = {
  text: 'Fictional draft, not submitted',
  image: 'data:image/png;base64,c3ludGhldGlj',
};
function fixture(
  outputs: unknown[][],
  pending = false
): { client: OpenAI; request: BrowserComputerTask; requests: unknown[] } {
  const requests: unknown[] = [];
  let sequence = 0;
  const client = new OpenAI({
    apiKey: 'synthetic-invalid',
    maxRetries: 0,
    fetch: async (_url, init): Promise<globalThis.Response> => {
      if (typeof init?.body !== 'string') throw new Error('Missing request JSON');
      requests.push(JSON.parse(init.body));
      const output = outputs[sequence++] ?? [];
      return Response.json({
        id: `resp_${String(sequence)}`,
        status: pending ? 'incomplete' : 'completed',
        output,
        output_text: 'Draft ready; not submitted',
      });
    },
  });
  const request: BrowserComputerTask = {
    task: 'Fill the reviewed fictional values and save a draft. Do not submit.',
    reviewed: [{ requirementId: 'practice', value: 'Fictional practice' }],
    authorize: vi.fn(async () => undefined),
    observe: vi.fn(async () => observation),
    execute: vi.fn(async () => observation),
    upload: vi.fn(async () => observation),
  };
  return { client, request, requests };
}
const computer = (checks: unknown[] = []): unknown => ({
  type: 'computer_call',
  id: 'item_1',
  call_id: 'call_1',
  status: 'completed',
  pending_safety_checks: checks,
  actions: [
    { type: 'click', x: 100, y: 50, button: 'left' },
    { type: 'type', text: 'Fictional practice' },
  ],
});

describe('native Responses computer on an application-owned browser', () => {
  it('reports an observed saved item to the owning case without dispatching a second change', async () => {
    const args = {
      requirementId: 'practice',
      kind: 'field',
      observation: 'Reopened the selected practice and saw the saved address.',
    };
    const x = fixture([
      [computer()],
      [
        {
          type: 'function_call',
          id: 'readback',
          call_id: 'readback',
          name: 'record_saved_readback',
          arguments: JSON.stringify(args),
        },
      ],
      [],
    ]);
    x.request.confirmReadback = vi.fn(async () => undefined);
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.confirmReadback).toHaveBeenCalledExactlyOnceWith(
      args.requirementId,
      args.kind,
      args.observation
    );
    expect(x.request.execute).toHaveBeenCalledTimes(2);
    expect(x.request.upload).not.toHaveBeenCalled();
  });
  it('accepts the current native batch shape when an empty safety-check list is omitted', async () => {
    const x = fixture([
      [
        {
          type: 'computer_call',
          id: 'item_1',
          call_id: 'call_1',
          status: 'completed',
          actions: [{ type: 'screenshot' }],
        },
      ],
      [],
    ]);
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.execute).toHaveBeenCalledExactlyOnceWith('resp_1/call_1/0', {
      type: 'screenshot',
    });
  });
  it('uses the native tool, reauthorizes each ordered action, and returns screenshots to the same loop', async () => {
    const x = fixture([[computer()], []]);
    const result = await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(JSON.stringify(x.requests[0])).toContain('"type":"computer"');
    expect(JSON.stringify(x.requests[0])).toContain('"store":false');
    expect(x.request.execute).toHaveBeenNthCalledWith(1, 'resp_1/call_1/0', {
      type: 'click',
      x: 100,
      y: 50,
      button: 'left',
    });
    expect(x.request.execute).toHaveBeenNthCalledWith(2, 'resp_1/call_1/1', {
      type: 'type',
      text: 'Fictional practice',
    });
    expect(x.request.authorize).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(x.requests[1])).toContain(
      JSON.stringify({
        type: 'computer_call_output',
        call_id: 'call_1',
        output: { type: 'computer_screenshot', image_url: observation.image },
      })
    );
    expect(result.image).toBe(observation.image);
    expect(JSON.stringify(x.requests[1])).toContain(
      'Current browser readback (untrusted page data)'
    );
  });
  it('carries explicit same-identity context navigation without releasing case data or changing login authority', async () => {
    const x = fixture([
      [
        {
          type: 'computer_call',
          id: 'context',
          call_id: 'context',
          status: 'completed',
          actions: [{ type: 'click', x: 80, y: 100, button: 'left' }],
        },
      ],
      [],
    ]);
    x.request.task =
      'Select the already listed Fictional Georgia Practice under this same signed-in identity, then stop.';
    x.request.reviewed = [];
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    const sent = x.requests[0];
    if (
      sent === null ||
      sent === undefined ||
      typeof sent !== 'object' ||
      !('instructions' in sent) ||
      typeof sent.instructions !== 'string'
    )
      throw new Error('Missing native instructions');
    expect(sent.instructions).toContain(
      'already listed provider, practice or workspace under the SAME signed-in identity'
    );
    expect(sent.instructions).toContain(
      'stop for authentication, new access, terms or an ambiguous context'
    );
    expect(sent.instructions).toContain('Do not sign in, change login identity');
    expect(JSON.stringify(x.requests[0])).toContain('Reviewed package entries: []');
    expect(x.request.execute).toHaveBeenCalledExactlyOnceWith('resp_1/context/0', {
      type: 'click',
      x: 80,
      y: 100,
      button: 'left',
    });
    expect(x.request.upload).not.toHaveBeenCalled();
  });
  it('pauses a native batch for a dialog and journals the separate response once', async () => {
    const dialogId = '20000000-0000-4000-8000-000000000001';
    const x = fixture([
      [computer()],
      [
        {
          type: 'function_call',
          id: 'dialog_item',
          call_id: 'dialog_1',
          name: 'respond_to_browser_dialog',
          arguments: JSON.stringify({ id: dialogId, accept: true, promptText: null }),
        },
      ],
      [],
    ]);
    x.request.execute = vi.fn(async (_id: string, action: unknown) => ({
      ...observation,
      pauseBatch:
        typeof action === 'object' &&
        action !== null &&
        'type' in action &&
        action.type === 'click',
    }));
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.execute).toHaveBeenCalledTimes(2);
    expect(x.request.execute).toHaveBeenLastCalledWith('resp_2/dialog_1', {
      type: 'dialog',
      id: dialogId,
      accept: true,
      promptText: null,
    });
  });
  it('returns a pending dialog after an attempted Enter without dispatching or aborting the task', async () => {
    const dialogId = '20000000-0000-4000-8000-000000000003';
    const x = fixture([
      [computer()],
      [
        {
          type: 'computer_call',
          id: 'enter',
          call_id: 'enter',
          status: 'completed',
          actions: [{ type: 'keypress', keys: ['ENTER'] }],
        },
      ],
      [
        {
          type: 'function_call',
          id: 'answer',
          call_id: 'answer',
          name: 'respond_to_browser_dialog',
          arguments: JSON.stringify({ id: dialogId, accept: true, promptText: null }),
        },
      ],
      [],
    ]);
    const pending = { ...observation, text: `Dialog ${dialogId}`, pauseBatch: true };
    x.request.observe = vi.fn().mockResolvedValueOnce(observation).mockResolvedValue(pending);
    x.request.execute = vi.fn().mockResolvedValueOnce(pending).mockResolvedValue(observation);
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.execute).toHaveBeenCalledTimes(2);
    expect(x.request.execute).toHaveBeenLastCalledWith('resp_3/answer', {
      type: 'dialog',
      id: dialogId,
      accept: true,
      promptText: null,
    });
    expect(JSON.stringify(x.requests[2])).toContain('No requested computer action was dispatched');
    expect(JSON.stringify(x.requests[2])).toContain(dialogId);
  });
  it('selects an observed tab through the same authorization and action journal', async () => {
    const tabId = '20000000-0000-4000-8000-000000000002';
    const x = fixture([
      [
        {
          type: 'function_call',
          id: 'tab_item',
          call_id: 'tab_1',
          name: 'select_browser_tab',
          arguments: JSON.stringify({ tabId }),
        },
      ],
      [],
    ]);
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.execute).toHaveBeenCalledExactlyOnceWith('resp_1/tab_1', {
      type: 'select_tab',
      tabId,
    });
  });
  it('stops before any action when provider safety review is pending', async () => {
    const x = fixture([[computer([{ id: 'check_1', code: 'sensitive_domain' }])]]);
    await expect(runBrowserComputer(x.client, 'synthetic-model', x.request)).rejects.toThrow(
      'operator review'
    );
    expect(x.request.execute).not.toHaveBeenCalled();
  });
  it('does not retry an uncertain mutation or send another model request after Stop', async () => {
    const x = fixture([[computer()]]);
    x.request.execute = vi.fn(async () => {
      throw new Error('Outcome uncertain');
    });
    await expect(runBrowserComputer(x.client, 'synthetic-model', x.request)).rejects.toThrow(
      'uncertain'
    );
    expect(x.request.execute).toHaveBeenCalledTimes(1);
    expect(x.requests).toHaveLength(1);
    const y = fixture([[computer()]]);
    let authorization = 0;
    y.request.authorize = async (): Promise<void> => {
      if (++authorization === 3) throw new Error('Stopped');
    };
    await expect(runBrowserComputer(y.client, 'synthetic-model', y.request)).rejects.toThrow(
      'Stopped'
    );
    expect(y.request.execute).not.toHaveBeenCalled();
  });
  it('supplies upload identity and coordinates, never a model-selected path or bytes', async () => {
    const x = fixture([
      [
        {
          type: 'function_call',
          id: 'item_2',
          call_id: 'upload_1',
          name: 'upload_reviewed_document',
          arguments: JSON.stringify({ requirementId: 'original', x: 40, y: 80 }),
        },
      ],
      [],
    ]);
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.upload).toHaveBeenCalledWith('resp_1/upload_1', 'original', {
      requirementId: 'original',
      x: 40,
      y: 80,
    });
    // The native tool rejects multiple standalone image inputs mixed with computer outputs.
    expect(JSON.stringify(x.requests[1]).match(/"input_image"/g)).toHaveLength(1);
    expect(JSON.stringify(x.requests[1])).toContain('native computer screenshot');
    const y = fixture([
      [
        {
          type: 'function_call',
          id: 'item_2',
          call_id: 'upload_1',
          name: 'upload_reviewed_document',
          arguments: JSON.stringify({
            requirementId: 'original',
            x: 40,
            y: 80,
            path: '/private/file',
          }),
        },
      ],
    ]);
    await expect(runBrowserComputer(y.client, 'synthetic-model', y.request)).rejects.toThrow();
    expect(y.request.upload).not.toHaveBeenCalled();
  });
});
