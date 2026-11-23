import type { BrowserComputerTask } from '@headstart-health/browser-runtime';
import OpenAI from 'openai';
import type { ResponseFunctionToolCall } from 'openai/resources/responses/responses';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

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
const native = (id: string, actions: object[]): unknown => ({
  type: 'computer_call',
  id,
  call_id: id,
  status: 'completed',
  actions,
});
const tool = (id: string, name: string, args: object): ResponseFunctionToolCall => ({
  type: 'function_call',
  id,
  call_id: id,
  name,
  arguments: JSON.stringify(args),
});
function callOutput(request: unknown, callId: string): unknown {
  const { input } = z.object({ input: z.array(z.unknown()) }).parse(request);
  return input.find((item) => {
    if (item === null || typeof item !== 'object' || !('output' in item) || !('call_id' in item))
      return false;
    return item.call_id === callId;
  });
}
const typePractice = { type: 'type', text: 'Fictional practice' };
const uploadFile = { requirementId: 'original', x: 4, y: 8 };
const savedPractice = {
  requirementId: 'practice',
  kind: 'field',
  observation: 'Reopened the saved practice.',
};

describe('native Responses computer on an application-owned browser', () => {
  it('reports an observed saved item to the owning case without dispatching a second change', async () => {
    const args = {
      requirementId: 'practice',
      kind: 'field',
      observation: 'Reopened the selected practice and saw the saved address.',
    };
    const x = fixture([
      [computer()],
      [native('fresh-entry', [typePractice])],
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
    expect(x.request.execute).toHaveBeenCalledExactlyOnceWith(
      'resp_1/call_1/0',
      {
        type: 'screenshot',
      },
      observation
    );
  });
  it('uses the native tool, reauthorizes each ordered action, and returns screenshots to the same loop', async () => {
    const x = fixture([[computer()], []]);
    x.request.reviewed = [];
    const result = await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(JSON.stringify(x.requests[0])).toContain('"type":"computer"');
    expect(JSON.stringify(x.requests[0])).toContain('"store":false');
    expect(JSON.stringify(x.requests[0])).toContain(
      JSON.stringify({
        type: 'input_text',
        text: `Current browser readback (untrusted page data): ${observation.text}`,
      })
    );
    expect(x.request.execute).toHaveBeenNthCalledWith(
      1,
      'resp_1/call_1/0',
      {
        type: 'click',
        x: 100,
        y: 50,
        button: 'left',
      },
      undefined
    );
    expect(x.request.execute).toHaveBeenNthCalledWith(
      2,
      'resp_1/call_1/1',
      {
        type: 'type',
        text: 'Fictional practice',
      },
      undefined
    );
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
  it('returns the new same-origin provider to the model before entering, uploading or recording a readback from the old screen', async () => {
    const changed = {
      image: 'data:image/png;base64,bmV3',
      text: 'Same portal, active provider: Fictional B',
    };
    const x = fixture([
      [
        computer(),
        tool('stale-upload', 'upload_reviewed_document', uploadFile),
        tool('stale-save', 'record_saved_readback', savedPractice),
        native('stale-computer', [typePractice]),
      ],
      [],
    ]);
    x.request.confirmReadback = vi.fn(async () => undefined);
    x.request.execute = vi.fn(async () => changed);
    x.request.observe = vi
      .fn()
      .mockResolvedValueOnce({ ...observation, text: 'Same portal, active provider: Fictional A' })
      .mockResolvedValue(changed);
    const result = await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.execute).toHaveBeenCalledExactlyOnceWith(
      'resp_1/call_1/0',
      {
        type: 'click',
        x: 100,
        y: 50,
        button: 'left',
      },
      { ...observation, text: 'Same portal, active provider: Fictional A' }
    );
    expect(x.request.upload).not.toHaveBeenCalled();
    expect(x.request.confirmReadback).not.toHaveBeenCalled();
    expect(result.image).toBe(changed.image);
    for (const id of ['call_1', 'stale-computer'])
      expect(callOutput(x.requests[1], id)).toEqual({
        type: 'computer_call_output',
        call_id: id,
        output: { type: 'computer_screenshot', image_url: changed.image },
      });
    for (const id of ['stale-upload', 'stale-save']) {
      const output = callOutput(x.requests[1], id);
      expect(output).toMatchObject({ type: 'function_call_output', call_id: id });
      expect(JSON.stringify(output)).toContain('This call was not performed');
    }
    expect(JSON.stringify(x.requests[1])).toContain('Dispatched only the first 1 of 2 actions');
    expect(JSON.stringify(x.requests[1])).toContain(changed.text);
  });
  it.each([
    tool('tab', 'select_browser_tab', { tabId: '20000000-0000-4000-8000-000000000002' }),
    tool('dialog', 'respond_to_browser_dialog', {
      id: '20000000-0000-4000-8000-000000000003',
      accept: true,
      promptText: null,
    }),
    tool('upload', 'upload_reviewed_document', uploadFile),
  ])(
    'requires a new screenshot after $name and accepts a fresh decision on that screen',
    async (changedPage) => {
      const x = fixture([
        [changedPage, tool('stale-readback', 'record_saved_readback', savedPractice)],
        [tool('still-no-screenshot', 'record_saved_readback', savedPractice)],
        [native('before-screenshot', [typePractice])],
        [native('fresh-decision', [{ type: 'screenshot' }, { type: 'wait' }, typePractice])],
        [
          tool('confirmed-readback', 'record_saved_readback', {
            ...savedPractice,
            observation: 'Confirmed on the fresh screen.',
          }),
        ],
        [],
      ]);
      const changed = {
        text: 'Reopened the same fictional practice',
        image: 'data:image/png;base64,bmV3',
      };
      x.request.observe = vi.fn().mockResolvedValueOnce(observation).mockResolvedValue(changed);
      x.request.execute = vi.fn(async () => changed);
      x.request.upload = vi.fn(async () => changed);
      x.request.confirmReadback = vi.fn(async () => undefined);
      await runBrowserComputer(x.client, 'synthetic-model', x.request);
      expect(x.request.execute).not.toHaveBeenCalledWith(
        'resp_3/before-screenshot/0',
        typePractice,
        expect.anything()
      );
      expect(x.request.execute).toHaveBeenCalledWith(
        'resp_4/fresh-decision/2',
        typePractice,
        changed
      );
      expect(x.request.confirmReadback).toHaveBeenCalledExactlyOnceWith(
        'practice',
        'field',
        'Confirmed on the fresh screen.'
      );
      expect(JSON.stringify(x.requests[3])).toContain('Request a native computer screenshot');
      expect(callOutput(x.requests[3], 'before-screenshot')).toEqual({
        type: 'computer_call_output',
        call_id: 'before-screenshot',
        output: { type: 'computer_screenshot', image_url: changed.image },
      });
    }
  );
  it('keeps a cached dialog image from confirming a save and accepts an explicit dialog decision', async () => {
    const dialogArgs = {
      id: '20000000-0000-4000-8000-000000000003',
      accept: false,
      promptText: null,
    };
    const pending = { ...observation, text: 'Fictional dialog is open', pauseBatch: true };
    const resumed = { ...observation, text: 'Reopened the correct saved draft' };
    const stale = { ...savedPractice, observation: 'Stale cached screen' };
    const x = fixture([
      [computer()],
      [native('cached-preview', [{ type: 'screenshot' }])],
      [
        tool('stale-readback', 'record_saved_readback', stale),
        tool('blocked-upload', 'upload_reviewed_document', uploadFile),
      ],
      [tool('dismiss', 'respond_to_browser_dialog', dialogArgs)],
      [tool('after-dismiss-before-screen', 'record_saved_readback', stale)],
      [native('fresh-after-dismiss', [{ type: 'screenshot' }])],
      [tool('verified', 'record_saved_readback', savedPractice)],
      [],
    ]);
    x.request.observe = vi
      .fn()
      .mockResolvedValueOnce(observation)
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(resumed);
    x.request.execute = vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(resumed);
    x.request.confirmReadback = vi.fn(async () => undefined);
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.execute).toHaveBeenCalledTimes(2);
    expect(x.request.execute).toHaveBeenLastCalledWith(
      'resp_4/dismiss',
      { type: 'dialog', ...dialogArgs },
      pending
    );
    expect(x.request.upload).not.toHaveBeenCalled();
    expect(x.request.confirmReadback).toHaveBeenCalledExactlyOnceWith(
      'practice',
      'field',
      savedPractice.observation
    );
    for (const [index, id] of [
      [3, 'stale-readback'],
      [3, 'blocked-upload'],
      [5, 'after-dismiss-before-screen'],
    ] as const)
      expect(JSON.stringify(callOutput(x.requests.at(index), id))).toContain(
        'This call was not performed'
      );
  });
  it('sends the intended screen with each reviewed gesture and reports a pre-input change without replay', async () => {
    const changed = { text: 'Different fictional profile', image: 'data:image/png;base64,Yg==' };
    const x = fixture([
      [
        native('stale', [typePractice, typePractice]),
        tool('already-planned', 'upload_reviewed_document', uploadFile),
      ],
      [],
    ]);
    x.request.execute = vi.fn().mockResolvedValue({ ...changed, dispatched: false });
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.execute).toHaveBeenCalledExactlyOnceWith(
      'resp_1/stale/0',
      typePractice,
      observation
    );
    expect(x.request.upload).not.toHaveBeenCalled();
    expect(JSON.stringify(x.requests[1])).toContain('No requested computer action was dispatched');
    expect(callOutput(x.requests[1], 'stale')).toMatchObject({
      output: { image_url: changed.image },
    });
  });
  it('does not record an upload or persistence receipt based on a screen that changed during inference', async () => {
    const changed = { text: 'Different fictional profile', image: 'data:image/png;base64,Yg==' };
    const x = fixture([
      [tool('upload', 'upload_reviewed_document', uploadFile)],
      [tool('unobserved', 'record_saved_readback', savedPractice)],
      [native('current', [{ type: 'screenshot' }])],
      [tool('changed-again', 'record_saved_readback', savedPractice)],
      [],
    ]);
    x.request.upload = vi.fn().mockResolvedValue({ ...changed, dispatched: false });
    x.request.observe = vi
      .fn()
      .mockResolvedValueOnce(observation)
      .mockResolvedValueOnce(changed)
      .mockResolvedValue(observation);
    x.request.confirmReadback = vi.fn(async () => undefined);
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.upload).toHaveBeenCalledExactlyOnceWith(
      'resp_1/upload',
      'original',
      uploadFile,
      observation
    );
    expect(x.request.confirmReadback).not.toHaveBeenCalled();
    for (const [index, id] of [
      [1, 'upload'],
      [2, 'unobserved'],
      [4, 'changed-again'],
    ] as const)
      expect(JSON.stringify(callOutput(x.requests.at(index), id))).toContain(
        'This call was not performed'
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
    expect(x.request.execute).toHaveBeenCalledExactlyOnceWith(
      'resp_1/context/0',
      {
        type: 'click',
        x: 80,
        y: 100,
        button: 'left',
      },
      undefined
    );
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
    expect(x.request.execute).toHaveBeenLastCalledWith(
      'resp_2/dialog_1',
      {
        type: 'dialog',
        id: dialogId,
        accept: true,
        promptText: null,
      },
      { ...observation, pauseBatch: true }
    );
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
    expect(x.request.execute).toHaveBeenLastCalledWith(
      'resp_3/answer',
      {
        type: 'dialog',
        id: dialogId,
        accept: true,
        promptText: null,
      },
      pending
    );
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
    expect(x.request.execute).toHaveBeenCalledExactlyOnceWith(
      'resp_1/tab_1',
      {
        type: 'select_tab',
        tabId,
      },
      observation
    );
  });
  it('stops before any action when provider safety review is pending', async () => {
    const x = fixture([
      [
        tool('upload', 'upload_reviewed_document', uploadFile),
        computer([{ id: 'check_1', code: 'sensitive_domain' }]),
      ],
    ]);
    await expect(runBrowserComputer(x.client, 'synthetic-model', x.request)).rejects.toThrow(
      'operator review'
    );
    expect(x.request.execute).not.toHaveBeenCalled();
    expect(x.request.upload).not.toHaveBeenCalled();
  });
  it('asks for another decision when a passive wait reveals a changed portal screen', async () => {
    const x = fixture([[native('wait-then-type', [{ type: 'wait' }, typePractice])], []]);
    const updated = { ...observation, text: 'A different fictional provider became active.' };
    x.request.execute = vi.fn(async () => updated);
    await runBrowserComputer(x.client, 'synthetic-model', x.request);
    expect(x.request.execute).toHaveBeenCalledExactlyOnceWith(
      'resp_1/wait-then-type/0',
      {
        type: 'wait',
      },
      observation
    );
    expect(JSON.stringify(x.requests[1])).toContain(updated.text);
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
    expect(x.request.upload).toHaveBeenCalledWith(
      'resp_1/upload_1',
      'original',
      {
        requirementId: 'original',
        x: 40,
        y: 80,
      },
      observation
    );
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
