import { z } from 'zod';

import { dockerCommand, type DockerCommand } from './executor-process.js';
import { fingerprint } from './fingerprint.js';
import type { ExecutorConnection } from './self-hosted.js';
import type { SessionExecutor } from './session-executor.js';

const label = 'health.headstart.agent-executor';
const identity = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
export const dockerExecutorSettingsSchema = z
  .object({
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

/** One deterministic container/volume per target and session. Only a local Docker daemon is
 * supported. No source access, model calls, host mounts, registry pull or application secrets.
 */
export class DockerSessionExecutor implements SessionExecutor {
  private readonly imageId: string;
  constructor(
    settings: unknown,
    private readonly target: string,
    private readonly credential: () => Promise<string>,
    private readonly command: DockerCommand = dockerCommand
  ) {
    this.imageId = dockerExecutorSettingsSchema.parse(settings).imageId;
    identity.parse(target);
  }

  private name(sessionId: string): string {
    identity.parse(sessionId);
    return `headstart-agent-${fingerprint({ target: this.target, sessionId }).slice(0, 32)}`;
  }

  private async local(): Promise<void> {
    const contexts = z
      .array(z.object({ Endpoints: z.object({ docker: z.object({ Host: z.string() }) }) }))
      .length(1)
      .parse(JSON.parse(await this.command(['context', 'inspect'])));
    if (!contexts[0]?.Endpoints.docker.Host.startsWith('unix:///'))
      throw new Error('Executor requires an explicitly local Docker context');
  }

  private async container(name: string): Promise<{
    Id: string;
    Image: string;
    State: { Running: boolean };
    Config: { Labels: Record<string, string> };
  } | null> {
    const ids = (
      await this.command(['container', 'ls', '-aq', '--filter', `name=^/${name}$`])
    ).trim();
    if (!ids) return null;
    if (!/^[a-f0-9]{12,64}$/.test(ids)) throw new Error('Ambiguous executor identity');
    const rows = z
      .array(
        z.object({
          Id: z.string(),
          Image: z.string(),
          State: z.object({ Running: z.boolean() }),
          Config: z.object({ Labels: z.record(z.string(), z.string()) }),
        })
      )
      .length(1)
      .parse(JSON.parse(await this.command(['container', 'inspect', ids])));
    const item = rows[0];
    if (
      item?.Image !== this.imageId ||
      item.Config.Labels['health.headstart.agent-executor'] !== name
    )
      throw new Error('Executor deployment identity changed; no replacement created');
    return item;
  }

  private async createContainer(name: string, args: string[]): Promise<void> {
    if (await this.container(name)) return;
    try {
      await this.command([
        'create',
        '--pull=never',
        '--name',
        name,
        '--label',
        `${label}=${name}`,
        '--init',
        '--read-only',
        '--user',
        '1000:1000',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--pids-limit=128',
        '--memory=1g',
        '--cpus=1',
        '--log-driver=none',
        '--tmpfs',
        '/tmp:rw,nosuid,nodev,size=64m,mode=1777',
        '--tmpfs',
        '/home/node:rw,nosuid,nodev,size=64m,uid=1000,gid=1000',
        ...args,
        this.imageId,
        name.endsWith('-egress') ? 'proxy' : 'supervisor',
      ]);
    } catch {
      // Docker's unique name is the cross-process create arbiter. Inspect only this exact name.
      if (!(await this.container(name))) throw new Error('Executor creation unconfirmed');
    }
  }

  private async network(name: string): Promise<void> {
    const ids = (await this.command(['network', 'ls', '-q', '--filter', `name=^${name}$`])).trim();
    if (!ids) {
      try {
        await this.command([
          'network',
          'create',
          '--internal',
          '--label',
          `${label}=${name}`,
          name,
        ]);
      } catch {
        /* Re-read the exact name after a concurrent create, never adopt a foreign network. */
      }
    }
    const networks = z
      .array(z.object({ Internal: z.literal(true), Labels: z.record(z.string(), z.string()) }))
      .length(1)
      .parse(JSON.parse(await this.command(['network', 'inspect', name])));
    if (networks[0]?.Labels['health.headstart.agent-executor'] !== name)
      throw new Error('Executor network identity changed');
  }

  private async volume(name: string, environment: string): Promise<void> {
    const volumeName = `${name}-workspace`;
    await this.command([
      'volume',
      'create',
      '--label',
      `${label}=${name}`,
      '--label',
      `health.headstart.agent-environment=${environment}`,
      volumeName,
    ]);
    const volumes = z
      .array(
        z.object({
          Driver: z.literal('local'),
          Options: z.record(z.string(), z.string()).nullable(),
          Labels: z.record(z.string(), z.string()),
        })
      )
      .length(1)
      .parse(JSON.parse(await this.command(['volume', 'inspect', volumeName])));
    const volume = volumes[0];
    if (
      volume?.Labels['health.headstart.agent-executor'] !== name ||
      volume.Labels['health.headstart.agent-environment'] !== environment ||
      Object.keys(volume.Options ?? {}).length
    )
      throw new Error('Executor workspace identity changed');
  }

  private async start(name: string): Promise<void> {
    const item = await this.container(name);
    if (!item) throw new Error('Executor missing');
    if (!item.State.Running) await this.command(['start', name]);
  }

  async ensure(connection: ExecutorConnection, expiresAt: number): Promise<void> {
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
      throw new Error('Executor authority expired');
    const name = this.name(connection.sessionId);
    const environment = fingerprint({
      target: this.target,
      sessionId: connection.sessionId,
      environmentId: connection.environmentId,
    });
    await this.local();
    await this.network(name);
    const proxy = `${name}-egress`;
    await this.createContainer(proxy, ['--network', 'bridge']);
    // Idempotent connect: inspect membership rather than treating any Docker error as success.
    const membership = z
      .array(
        z.object({ NetworkSettings: z.object({ Networks: z.record(z.string(), z.unknown()) }) })
      )
      .length(1)
      .parse(JSON.parse(await this.command(['container', 'inspect', proxy])));
    if (!Object.hasOwn(membership[0]?.NetworkSettings.Networks ?? {}, name)) {
      try {
        await this.command(['network', 'connect', '--alias', 'openai-egress', name, proxy]);
      } catch {
        throw new Error('Executor egress connection unconfirmed; reconcile before retry');
      }
    }
    await this.start(proxy);
    // A named, session-specific Docker volume persists through backend/container restart.
    await this.volume(name, environment);
    await this.createContainer(name, [
      '--label',
      `health.headstart.agent-environment=${environment}`,
      '--network',
      name,
      '--mount',
      `type=volume,src=${name}-workspace,dst=/workspace`,
      '--env',
      'HTTPS_PROXY=http://openai-egress:8080',
      '--env',
      'HTTP_PROXY=http://openai-egress:8080',
    ]);
    const retained = await this.container(name);
    if (retained?.Config.Labels['health.headstart.agent-environment'] !== environment)
      throw new Error('Executor environment binding changed');
    await this.start(name);
    const key = await this.credential();
    const result = await this.command(
      ['exec', '-i', name, 'node', '/opt/agent-executor/control.cjs'],
      JSON.stringify({ connection, expiresAt, key })
    );
    if (result.trim() !== 'ready') throw new Error('Executor startup unconfirmed');
  }

  async stop(sessionId: string): Promise<void> {
    const name = this.name(sessionId);
    await this.local();
    for (const resource of [name, `${name}-egress`]) {
      const item = await this.container(resource);
      if (item?.State.Running) await this.command(['stop', '--time', '5', resource]);
    }
    // Retain the volume and resource identities for diagnosis; never silently delete evidence.
  }
}
