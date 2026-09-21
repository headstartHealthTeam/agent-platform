import { ChildProcess } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DockerSessionExecutor } from './docker-executor.js';
import type { DockerCommand } from './executor-process.js';
import { ExecutorSupervisor } from './executor-supervisor.js';
import { fingerprint } from './platform.js';
import { selfHostedExecutorConnection } from './self-hosted.js';

const imageId = `sha256:${'a'.repeat(64)}`;
const target = 'invented-target';
const session = {
  id: 'session-invented',
  environment: {
    type: 'self_hosted',
    id: 'env-invented',
    remote_url: 'https://api.openai.com/v1/agents/api/connect/invented',
  },
};
const connection = selfHostedExecutorConnection(session, session.id);
const name = `headstart-agent-${fingerprint({ target, sessionId: session.id }).slice(0, 32)}`;
const label = 'health.headstart.agent-executor';

interface Container {
  Id: string;
  Image: string;
  State: { Running: boolean };
  Config: { Labels: Record<string, string> };
  NetworkSettings: { Networks: Record<string, object> };
}
function docker(): {
  command: ReturnType<typeof vi.fn<DockerCommand>>;
  containers: Map<string, Container>;
  credential: ReturnType<typeof vi.fn<() => Promise<string>>>;
} {
  const containers = new Map<string, Container>();
  const network = (args: readonly string[]): string => {
    if (args[1] === 'ls') return 'network';
    if (args[1] === 'inspect')
      return JSON.stringify([{ Internal: true, Labels: { [label]: name } }]);
    if (args[1] === 'connect') {
      const proxy = containers.get(`${name}-egress`);
      if (!proxy) throw new Error('Missing proxy');
      proxy.NetworkSettings.Networks = { [name]: {} };
    }
    return '';
  };
  const inspect = (selected: string | undefined): string => {
    const item = [...containers.entries()].find(
      ([key, value]) => key === selected || value.Id === selected
    )?.[1];
    if (!item) throw new Error('Missing container');
    return JSON.stringify([item]);
  };
  const volume = (args: readonly string[]): string =>
    args[1] === 'inspect'
      ? JSON.stringify([
          {
            Driver: 'local',
            Options: null,
            Labels: {
              [label]: name,
              'health.headstart.agent-environment': fingerprint(connection),
            },
          },
        ])
      : '';
  const command = vi.fn<DockerCommand>(async (args) => {
    const option = (key: string): string => {
      const value = args[args.indexOf(key) + 1];
      if (!value) throw new Error('Missing fixture argument');
      return value;
    };
    if (args[0] === 'context')
      return JSON.stringify([{ Endpoints: { docker: { Host: 'unix:///invented/docker.sock' } } }]);
    if (args[0] === 'network') return network(args);
    if (args[0] === 'volume') return volume(args);
    if (args[0] === 'container' && args[1] === 'ls') {
      const queried = option('--filter').slice('name=^/'.length, -1);
      return containers.get(queried)?.Id ?? '';
    }
    if (args[0] === 'container' && args[1] === 'inspect') return inspect(args[2]);
    if (args[0] === 'create') {
      const key = option('--name');
      if (containers.has(key)) throw new Error('Already exists');
      containers.set(key, {
        Id: String(containers.size + 1).repeat(64),
        Image: imageId,
        State: { Running: false },
        Config: {
          Labels: { [label]: key, 'health.headstart.agent-environment': fingerprint(connection) },
        },
        NetworkSettings: { Networks: {} },
      });
      return key;
    }
    if (args[0] === 'start' || args[0] === 'stop') {
      const item = containers.get(args.at(-1) ?? '');
      if (!item) throw new Error('Missing container');
      item.State.Running = args[0] === 'start';
      return '';
    }
    if (args[0] === 'exec') return 'ready';
    throw new Error('Unsupported Docker fixture operation');
  });
  return { command, containers, credential: vi.fn(async () => 'invented-environment-credential') };
}

describe('retained local executor lifecycle', () => {
  it('uses stable per-session resources and private stdin; a new host instance reuses them', async () => {
    const fixture = docker();
    const expiry = Date.now() + 60_000;
    await new DockerSessionExecutor(
      { imageId },
      target,
      fixture.credential,
      fixture.command
    ).ensure(connection, expiry);
    const created = fixture.command.mock.calls.filter(([args]) => args[0] === 'create');
    expect(created).toHaveLength(2);
    const executor = created.find(([args]) => args.includes(name));
    expect(executor?.[0]).toEqual(
      expect.arrayContaining([
        '--read-only',
        '--cap-drop=ALL',
        '--log-driver=none',
        '--network',
        name,
      ])
    );
    expect(created.flatMap(([args]) => args).join(' ')).not.toContain(
      'invented-environment-credential'
    );
    expect(fixture.command.mock.calls.find(([args]) => args[0] === 'exec')?.[1]).toContain(
      'invented-environment-credential'
    );
    fixture.command.mockClear();
    await new DockerSessionExecutor(
      { imageId },
      target,
      fixture.credential,
      fixture.command
    ).ensure(connection, expiry);
    expect(fixture.command.mock.calls.some(([args]) => args[0] === 'create')).toBe(false);
    const port = new DockerSessionExecutor(
      { imageId },
      target,
      fixture.credential,
      fixture.command
    );
    await port.stop(connection.sessionId);
    expect([...fixture.containers.values()].every((item) => !item.State.Running)).toBe(true);
    expect(fixture.command.mock.calls.some(([args]) => args.includes('rm'))).toBe(false);
    await port.ensure(connection, expiry);
    expect(fixture.containers.size).toBe(2);
  });
  it('rejects expired authority, remote daemons, changed images and unconfirmed startup', async () => {
    const fixture = docker();
    const port = new DockerSessionExecutor(
      { imageId },
      target,
      fixture.credential,
      fixture.command
    );
    await expect(port.ensure(connection, 0)).rejects.toThrow('expired');
    expect(fixture.command).not.toHaveBeenCalled();
    fixture.command.mockResolvedValueOnce(
      JSON.stringify([{ Endpoints: { docker: { Host: 'ssh://other' } } }])
    );
    await expect(port.ensure(connection, Date.now() + 60_000)).rejects.toThrow('local Docker');
    await port.ensure(connection, Date.now() + 60_000);
    const item = fixture.containers.get(name);
    if (!item) throw new Error('Expected executor');
    item.Image = 'foreign';
    await expect(port.ensure(connection, Date.now() + 60_000)).rejects.toThrow('identity changed');
    await expect(port.stop(connection.sessionId)).rejects.toThrow('identity changed');
    expect(fixture.containers.size).toBe(2);
  });
});

describe('container-local executor owner', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps the replacement child deadline when the old child emits a late exit', () => {
    vi.useFakeTimers();
    const first = new ChildProcess();
    const second = new ChildProcess();
    const kill = vi.spyOn(second, 'kill').mockReturnValue(true);
    const spawn = vi.fn(() => second).mockReturnValueOnce(first);
    const supervisor = new ExecutorSupervisor(spawn);
    const payload = { connection, key: 'invented', expiresAt: Date.now() + 60_000 };
    supervisor.ensure(payload);
    first.emit('error', new Error('invented failure'));
    supervisor.ensure(payload);
    first.emit('exit', 1);
    vi.advanceTimersByTime(60_000);
    expect(kill).toHaveBeenCalledWith('SIGTERM');
    second.emit('exit', 0);
  });
  it('starts one child, retains it between turns and reconnects without overwriting the workspace', () => {
    vi.useFakeTimers();
    const child = new ChildProcess();
    const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
    const spawn = vi.fn(() => child);
    const supervisor = new ExecutorSupervisor(spawn);
    const payload = {
      connection,
      key: 'invented-environment-credential',
      expiresAt: Date.now() + 60_000,
    };
    supervisor.ensure(payload);
    supervisor.ensure(payload);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(connection.arguments, payload.key);
    child.emit('exit', 1);
    supervisor.ensure(payload);
    expect(spawn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    expect(kill).toHaveBeenCalledWith('SIGTERM');
    vi.advanceTimersByTime(5000);
    expect(kill).toHaveBeenCalledWith('SIGKILL');
    expect(() => {
      supervisor.ensure(payload);
    }).toThrow('expired');
  });
  it('rejects another binding, changed remote URL, malformed payload and deadline extension', () => {
    const child = new ChildProcess();
    vi.spyOn(child, 'kill').mockReturnValue(true);
    const supervisor = new ExecutorSupervisor(() => child);
    const payload = { connection, key: 'invented', expiresAt: Date.now() + 60_000 };
    supervisor.ensure(payload);
    expect(() => {
      supervisor.ensure({ ...payload, expiresAt: payload.expiresAt + 1 });
    }).toThrow('binding changed');
    expect(() => {
      supervisor.ensure({ ...payload, connection: { ...connection, arguments: ['sh'] } });
    }).toThrow();
    expect(() => {
      supervisor.ensure({
        ...payload,
        connection: {
          ...connection,
          arguments: [
            'exec-server',
            '--remote',
            'https://unapproved.example',
            '--environment-id',
            'env-invented',
          ],
        },
      });
    }).toThrow();
    supervisor.stop();
    child.emit('error', new Error('invented failure'));
    supervisor.stop();
  });
});
