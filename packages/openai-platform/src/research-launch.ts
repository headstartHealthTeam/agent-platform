import type { AgentLaunchDefinition } from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import type { Action } from './operations.js';
import { launchSettings } from './session-launch.js';

/** Deliberately copy only model settings, never environment/source configuration or credentials. */
export function publicResearchSettings(configured: unknown): unknown {
  const settings = launchSettings.parse(configured);
  return {
    model: settings.model,
    reasoning: settings.reasoning,
    mcpServers: [],
    environment: {
      type: 'openai_hosted',
      desktop: { enabled: true },
      network: { access: 'enabled' },
    },
  };
}

const publicBrowser = 'public-browser';
const research = z.enum(['live-web-search', publicBrowser]).optional();
const publicEnvironment = z
  .object({
    type: z.literal('openai_hosted'),
    desktop: z.object({ enabled: z.literal(true) }).strict(),
    network: z.object({ access: z.literal('enabled') }).strict(),
  })
  .strict();

/** Native web search runs in the service, not through the credentialed sandbox's network.
 * A fresh browser environment is a separate workload: never copy credentials, templates or
 * private source files into it merely to broaden the primary agent's network access.
 */
export function researchTools(
  mode: AgentLaunchDefinition['research']
): (
  | { type: 'web_search'; mode: 'live'; context_size: 'high' }
  | { type: 'computer_use'; include_screenshots: false }
)[] {
  const value = research.parse(mode);
  if (value === undefined) return [];
  const search = { type: 'web_search', mode: 'live', context_size: 'high' } as const;
  return value === publicBrowser
    ? [search, { type: 'computer_use', include_screenshots: false }]
    : [search];
}

export function validateResearchLaunch(
  definition: AgentLaunchDefinition,
  action: Extract<Action, { operation: 'sessions.create' }>,
  hasCredentialConfig: boolean
): void {
  if (definition.research !== publicBrowser) return;
  publicEnvironment.parse(action.body.environment);
  if (
    hasCredentialConfig ||
    definition.capabilities !== undefined ||
    definition.runtimeRevision !== undefined ||
    definition.tools.length !== 0 ||
    !('agent' in action.body) ||
    action.body.agent.tools?.some((tool) => !['web_search', 'computer_use'].includes(tool.type))
  )
    throw new Error('Public browser research requires a fresh credential-free environment');
}
