import type {
  AgentCredentialVault,
  AgentLaunchIdentity,
} from '@headstart-health/workflow-contracts';
import type OpenAI from 'openai';
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
export const runtimeCredentialBindings = z
  .array(
    z
      .object({
        serverLabel: z.string().min(1),
        environmentVariable: z
          .string()
          .regex(/^[A-Z_][A-Z0-9_]*$/)
          .refine(
            (name) => !name.startsWith('CODEX_') && name !== 'OPENAI_API_KEY' && name !== 'PATH'
          ),
      })
      .strict()
  )
  .min(1)
  .refine(
    (bindings) =>
      new Set(bindings.map((binding) => binding.serverLabel)).size === bindings.length &&
      new Set(bindings.map((binding) => binding.environmentVariable)).size === bindings.length
  );

export interface HostedEnvironmentCredential {
  name: string;
  host: string;
  authorization: string;
}

function assertCredentialInventory(
  listed: { auth: { secret_name: string } }[],
  expected: HostedEnvironmentCredential[],
  hasMore: boolean
): void {
  if (
    hasMore ||
    listed.some(
      (item) => !expected.some((credential) => credential.name === item.auth.secret_name)
    ) ||
    new Set(listed.map((item) => item.auth.secret_name)).size !== listed.length
  )
    throw new Error('Unexpected vault contents');
}

/** One vault per launch, never a shared mutable bag of run tokens. Native SDK resources own
 * transport and types; exact response validation retains application ownership boundaries.
 */
export class HostedCredentialVaults {
  constructor(private readonly client: OpenAI) {}

  private async ownedVault(
    identity: AgentLaunchIdentity,
    retained?: AgentCredentialVault
  ): Promise<{ id: string }> {
    const metadata = {
      managed_by: 'headstart-agent-runtime',
      launch_request: z.uuid().parse(identity.requestId),
      workflow_revision: id.parse(identity.workflowRevision),
      runtime_target: id.parse(identity.target),
    };
    const schema = z.object({
      id,
      metadata: z.object({
        managed_by: z.literal(metadata.managed_by),
        launch_request: z.literal(metadata.launch_request),
        workflow_revision: z.literal(metadata.workflow_revision),
        runtime_target: z.literal(metadata.runtime_target),
      }),
    });
    if (
      retained &&
      (retained.target !== identity.target ||
        retained.requestId !== identity.requestId ||
        retained.workflowRevision !== identity.workflowRevision)
    )
      throw new Error('Mismatched vault');
    const vault = schema.parse(
      retained
        ? await this.client.beta.agents.vaults.retrieve(id.parse(retained.id))
        : await this.client.beta.agents.vaults.create({
            name: `Headstart launch ${identity.requestId}`,
            metadata,
          })
    );
    if (retained && vault.id !== retained.id) throw new Error('Mismatched vault ID');
    return vault;
  }

  async provision(
    identity: AgentLaunchIdentity,
    credentials: HostedEnvironmentCredential[],
    retain: (vault: AgentCredentialVault) => Promise<void>,
    retained?: AgentCredentialVault
  ): Promise<string> {
    try {
      const vault = await this.ownedVault(identity, retained);
      // No secret is installed until this exact non-secret receipt is durably acknowledged.
      // A lost vault-create reply can leave only an empty vault, not an active credential/session.
      await retain({ kind: 'openai-credential-vault', id: vault.id, ...identity });
      const existing = await this.client.beta.agents.vaults.credentials.list(vault.id, {
        limit: 100,
        status: 'active',
      });
      const publicCredential = z.object({
        id,
        vault_id: z.literal(vault.id),
        auth: z.object({
          type: z.literal('environment_variable'),
          secret_name: z.string(),
          networking: z.object({ type: z.literal('limited'), allowed_hosts: z.array(z.string()) }),
        }),
      });
      const listed = z.array(publicCredential).parse(existing.data);
      assertCredentialInventory(listed, credentials, existing.has_more);
      for (const credential of credentials) {
        const saved = listed.find((item) => item.auth.secret_name === credential.name);
        if (
          saved &&
          (saved.auth.networking.allowed_hosts.length !== 1 ||
            saved.auth.networking.allowed_hosts[0] !== credential.host)
        )
          throw new Error('Wrong credential host');
        const auth = {
          type: 'environment_variable' as const,
          secret_name: credential.name,
          secret_value: credential.authorization,
          networking: { type: 'limited' as const, allowed_hosts: [credential.host] },
        };
        const raw = saved
          ? await this.client.beta.agents.vaults.credentials.update(saved.id, {
              vault_id: vault.id,
              auth: { type: auth.type, secret_value: auth.secret_value },
            })
          : await this.client.beta.agents.vaults.credentials.create(vault.id, {
              name: credential.name,
              auth,
            });
        const updated = publicCredential.parse(raw);
        if (
          (saved && updated.id !== saved.id) ||
          updated.auth.secret_name !== credential.name ||
          updated.auth.networking.allowed_hosts.length !== 1 ||
          updated.auth.networking.allowed_hosts[0] !== credential.host
        )
          throw new Error('Unexpected credential receipt');
      }
      return vault.id;
    } catch {
      // Never propagate a credential-bearing SDK request/error or response into application state.
      throw new Error('Hosted credential setup failed; no session creation was attempted.');
    }
  }
}
