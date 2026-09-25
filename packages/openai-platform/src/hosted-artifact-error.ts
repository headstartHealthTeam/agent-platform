import type { AgentArtifactFailureCode } from '@headstart-health/workflow-contracts';

export class HostedArtifactError extends Error {
  constructor(readonly code: AgentArtifactFailureCode) {
    super(
      code === 'artifact-capacity'
        ? 'Published file exceeds artifact delivery capacity; the original was not substituted.'
        : 'Published file identity is invalid; correct its exact output reference.'
    );
  }
}
