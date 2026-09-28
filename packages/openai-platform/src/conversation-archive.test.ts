import { createHash } from 'node:crypto';

import type { AgentConversationPart } from '@headstart-health/workflow-contracts';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { resolveRuntimeConfig } from './config.js';
import { exportConversation, deleteConversation } from './conversation-archive.js';
import { readSchema } from './operations.js';
import { OperatorRuntimePort } from './operator-runtime.js';
import { fingerprint, OpenAIPlatform, OpenAIResourceMissingError } from './platform.js';

const config = resolveRuntimeConfig({
  profile: {
    schemaVersion: 'headstart-capability-profile/v1',
    id: 'synthetic',
    revision: 'v1',
    bindings: [
      {
        capabilityId: 'openai.agents.read',
        providerId: 'openai-sdk',
        adapterVersion: '0.1.0',
        options: { organizationId: 'org-synthetic', projectId: 'proj_synthetic' },
      },
    ],
  },
});
const binding = {
  sessionId: 'session',
  turnId: 'root',
  target: fingerprint(config.target),
  workflowRevision: 'revision',
};
const root = {
  id: 'root',
  session_id: 'session',
  subagent_id: null,
  status: 'completed',
  created_at: 1,
};
const child = { ...root, id: 'child-turn', subagent_id: 'child' };
const item = (
  index: number,
  turn = 'root'
): { id: string; turn_id: string; type: string; status: string; output: { original: string } } => ({
  id: `item_${String(index)}`,
  turn_id: turn,
  type: 'function_call_output',
  status: 'completed',
  output: { original: `full result ${String(index)}` },
});

function fixture(): {
  platform: { read: OpenAIPlatform['read']; apply: Mock<OpenAIPlatform['apply']> };
  session: {
    id: string;
    metadata: { workflow_revision: string };
    status: string;
    last_active_at: number;
    required_actions: unknown[];
  };
  turns: {
    id: string;
    session_id: string;
    subagent_id: string | null;
    status: string;
    created_at: number;
  }[];
  items: ReturnType<typeof item>[];
  children: { id: string; session_id: string; parent_agent_id: string; status: string }[];
  childItems: ReturnType<typeof item>[];
  requests: unknown[];
} {
  const session = {
    id: 'session',
    metadata: { workflow_revision: 'revision' },
    status: 'idle',
    last_active_at: 1,
    required_actions: [],
  };
  const turns = [root, child];
  const items = Array.from({ length: 231 }, (_, index) => item(index));
  const children = [
    { id: 'child', session_id: 'session', parent_agent_id: 'agent', status: 'active' },
  ];
  const childItems = Array.from({ length: 205 }, (_, index) => item(index, 'child-turn'));
  const requests: unknown[] = [];
  const read: OpenAIPlatform['read'] = async (input) => {
    requests.push(input);
    const request = readSchema.parse(input);
    if (request.operation === 'sessions.get')
      return { data: structuredClone(session), fingerprint: '' };
    let source: { id: string }[];
    switch (request.operation) {
      case 'sessions.turns':
        source = turns;
        break;
      case 'sessions.items':
        source = items;
        break;
      case 'sessions.subagents':
        source = children;
        break;
      case 'sessions.subagent.turns':
        source = [child];
        break;
      case 'sessions.subagent.items':
        source = childItems;
        break;
      case 'models.list':
      case 'agents.list':
      case 'agents.get':
      case 'sessions.list':
      case 'sessions.pending-functions':
      case 'sessions.turn.get':
      case 'templates.list':
      case 'templates.get':
        throw new Error('Unexpected read');
    }
    const offset = request.query.after
      ? source.findIndex((entry) => entry.id === request.query.after) + 1
      : 0;
    return {
      fingerprint: '',
      data: {
        data: structuredClone(source.slice(offset, offset + 100)),
        has_more: offset + 100 < source.length,
      },
    };
  };
  const apply = vi
    .fn<OpenAIPlatform['apply']>()
    .mockImplementation(async (_action, _approval, options) => {
      await options?.beforeDispatch?.();
      return { data: { id: 'session', deleted: true }, fingerprint: '' };
    });
  return { platform: { read, apply }, session, turns, items, children, childItems, requests };
}

describe('complete saved conversation export and guarded deletion', () => {
  it('retains all original root/delegated records and verifies the ordered manifest without truncating tool results', async () => {
    const source = fixture();
    const long = '原始 evidence '.repeat(200_000);
    source.items[0] = { ...item(0), output: { original: long } };
    const parts: AgentConversationPart[] = [];
    const manifest = await exportConversation(source.platform, binding, async (part) => {
      parts.push(part);
    });
    const rows = (resource: AgentConversationPart['resource']): unknown[] =>
      parts
        .filter((part) => part.resource === resource)
        .flatMap((part): unknown[] => {
          const data: unknown = JSON.parse(part.json);
          if (!Array.isArray(data)) throw new Error('Invalid fixture');
          return data;
        });
    expect(rows('items')).toEqual(source.items);
    expect(rows('subagent-items')).toEqual(source.childItems);
    expect(rows('turns')).toEqual(source.turns);
    expect(rows('session')).toEqual([source.session]);
    expect(parts.map((part) => part.ordinal)).toEqual(parts.map((_, index) => index));
    expect(manifest.digest).toBe(
      `sha256:${createHash('sha256')
        .update(parts.map((part) => JSON.stringify(part) + '\n').join(''))
        .digest('hex')}`
    );
    expect(manifest.bytes).toBe(
      parts.reduce((total, part) => total + Buffer.byteLength(part.json), 0)
    );
    expect(manifest.resources).toBe(441);
    expect(manifest.limitations.join(' ')).toContain('private reasoning');
    expect(source.platform.apply).not.toHaveBeenCalled();
  });

  it('never returns a manifest when the retention sink fails', async () => {
    const source = fixture();
    const retain = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    await expect(exportConversation(source.platform, binding, retain)).rejects.toThrow(
      'storage unavailable'
    );
    expect(retain).toHaveBeenCalledOnce();
    expect(source.platform.apply).not.toHaveBeenCalled();
  });

  it.each(['in_progress', 'requires_action'])('rejects a mutable %s session', async (status) => {
    const source = fixture();
    source.session.status = status;
    await expect(
      exportConversation(source.platform, binding, () => Promise.resolve())
    ).rejects.toThrow('not quiescent');
  });
  it('rejects pending actions even if the session reports idle', async () => {
    const source = fixture();
    const read: OpenAIPlatform['read'] = async (input) =>
      readSchema.parse(input).operation === 'sessions.get'
        ? {
            data: { ...source.session, required_actions: [{ type: 'function_call' }] },
            fingerprint: '',
          }
        : source.platform.read(input);
    await expect(exportConversation({ read }, binding, () => Promise.resolve())).rejects.toThrow(
      'not quiescent'
    );
  });
  it.each(['foreign', 'duplicate', 'mutable', 'new-root'])(
    'fails an inconsistent %s export',
    async (variant) => {
      const source = fixture();
      if (variant === 'foreign') source.items[0] = item(0, 'unowned');
      if (variant === 'duplicate') source.items[1] = item(0);
      if (variant === 'mutable') source.items[0] = { ...item(0), status: 'in_progress' };
      let modified = false;
      await expect(
        exportConversation(source.platform, binding, async (part) => {
          if (variant === 'new-root' && part.resource === 'items' && !modified) {
            source.turns.push({ ...root, id: 'new-root' });
            modified = true;
          }
        })
      ).rejects.toThrow();
    }
  );
  it('detects a new turn even when the provider activity timestamp has not changed', async () => {
    const source = fixture();
    await expect(
      exportConversation(source.platform, binding, async (part) => {
        if (part.resource === 'subagent-items' && part.ordinal === 9)
          source.turns.push({ ...root, id: 'later' });
      })
    ).rejects.toThrow('turns changed');
  });
  it('rejects non-advancing pagination', async () => {
    const source = fixture();
    const read: OpenAIPlatform['read'] = async (input) =>
      readSchema.parse(input).operation === 'sessions.items'
        ? { data: { data: [], has_more: true }, fingerprint: '' }
        : source.platform.read(input);
    await expect(exportConversation({ read }, binding, () => Promise.resolve())).rejects.toThrow(
      'cursor'
    );
  });
  it('preserves legacy nullable IDs and provider-incomplete outputs instead of fabricating content', async () => {
    const source = fixture();
    const read: OpenAIPlatform['read'] = async (input) =>
      readSchema.parse(input).operation === 'sessions.items'
        ? {
            data: {
              data: [{ ...item(0), id: null, status: 'incomplete', unavailable: true }],
              has_more: false,
            },
            fingerprint: '',
          }
        : source.platform.read(input);
    const parts: AgentConversationPart[] = [];
    await exportConversation({ read }, binding, async (part) => {
      parts.push(part);
    });
    expect(parts.find((part) => part.resource === 'items')?.json).toContain('"unavailable":true');
  });
  it('rechecks the full saved content and current owner authority before dispatch', async () => {
    const source = fixture();
    const manifest = await exportConversation(source.platform, binding, () => Promise.resolve());
    const beforeDispatch = vi.fn(() => Promise.resolve());
    expect(
      await deleteConversation(source.platform, config.target, manifest, beforeDispatch)
    ).toEqual({ status: 'deleted' });
    expect(beforeDispatch).toHaveBeenCalledOnce();
    expect(source.platform.apply).toHaveBeenCalledWith(
      { operation: 'sessions.delete', id: 'session' },
      expect.objectContaining({ allowBillable: false }),
      { beforeDispatch }
    );
    source.items[0] = { ...item(0), output: { original: 'changed without timestamp change' } };
    await expect(
      deleteConversation(source.platform, config.target, manifest, beforeDispatch)
    ).rejects.toThrow('changed since');
    expect(source.platform.apply).toHaveBeenCalledOnce();
  });
  it('does not dispatch when the final application gate rejects', async () => {
    const source = fixture();
    const manifest = await exportConversation(source.platform, binding, () => Promise.resolve());
    await expect(
      deleteConversation(source.platform, config.target, manifest, async () => {
        throw new Error('hold');
      })
    ).rejects.toThrow('hold');
  });
  it('reports only a missing session as absent, not a missing child resource', async () => {
    const source = fixture();
    const manifest = await exportConversation(source.platform, binding, () => Promise.resolve());
    const read: OpenAIPlatform['read'] = async () => {
      throw new OpenAIResourceMissingError();
    };
    expect(
      await deleteConversation({ ...source.platform, read }, config.target, manifest, () =>
        Promise.resolve()
      )
    ).toEqual({ status: 'absent' });
    const childMissing: OpenAIPlatform['read'] = async (input) => {
      if (readSchema.parse(input).operation === 'sessions.subagents')
        throw new OpenAIResourceMissingError();
      return source.platform.read(input);
    };
    await expect(
      deleteConversation({ ...source.platform, read: childMissing }, config.target, manifest, () =>
        Promise.resolve()
      )
    ).rejects.toThrow();
  });
  it('uses the pinned SDK routes for nested history without another HTTP client', async () => {
    const paths: string[] = [];
    const transport: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      paths.push(new URL(request.url).pathname + new URL(request.url).search);
      expect(request.headers.get('openai-project')).toBe('proj_synthetic');
      return Response.json(
        { data: [], has_more: false },
        { headers: { 'openai-project': 'proj_synthetic' } }
      );
    };
    const platform = new OpenAIPlatform(config, 'synthetic', transport);
    for (const operation of [
      'sessions.subagents',
      'sessions.subagent.turns',
      'sessions.subagent.items',
    ]) {
      await platform.read({
        operation,
        id: 'session',
        ...(operation === 'sessions.subagents' ? {} : { subagentId: 'child' }),
        query: { limit: 100, order: 'asc', after: 'cursor' },
      });
    }
    expect(paths).toEqual(
      expect.arrayContaining([
        '/v1/agents/sessions/session/subagents?limit=100&order=asc&after=cursor',
        '/v1/agents/sessions/session/subagents/child/turns?limit=100&order=asc&after=cursor',
        '/v1/agents/sessions/session/subagents/child/items?limit=100&order=asc&after=cursor',
      ])
    );
  });
  it('retains runtime target and closed-port checks', async () => {
    const source = fixture();
    const port = new OperatorRuntimePort(
      { ...source.platform, preflight: vi.fn(), openOperatorObservation: vi.fn() },
      config.target
    );
    await expect(
      port.exportConversation({ ...binding, target: 'other' }, () => Promise.resolve())
    ).rejects.toThrow('target');
    const manifest = await port.exportConversation(binding, () => Promise.resolve());
    await expect(
      port.deleteConversation({ ...manifest, binding: { ...binding, target: 'other' } }, () =>
        Promise.resolve()
      )
    ).rejects.toThrow('target');
    expect(await port.deleteConversation(manifest, () => Promise.resolve())).toEqual({
      status: 'deleted',
    });
    port.close();
    await expect(port.exportConversation(binding, () => Promise.resolve())).rejects.toThrow(
      'closed'
    );
  });
});
