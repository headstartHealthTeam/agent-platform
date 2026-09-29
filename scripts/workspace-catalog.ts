export interface WorkspaceRepository {
  hub: string;
  repository: string;
  baseline: 'dev' | 'main';
  purpose: string;
}

export const WORKSPACE_REPOSITORIES: readonly WorkspaceRepository[] = [
  {
    hub: 'agent-platform',
    repository: 'agent-platform',
    baseline: 'main',
    purpose: 'Shared skills, agent workflows and runtime code',
  },
  {
    hub: 'backend',
    repository: 'headstart-health-backend',
    baseline: 'dev',
    purpose: 'APIs, persistence, integrations and background work',
  },
  {
    hub: 'frontend',
    repository: 'headstart-health-frontend',
    baseline: 'dev',
    purpose: 'Authenticated client and provider portal',
  },
  {
    hub: 'admin-panel',
    repository: 'headstart-health-admin-panel',
    baseline: 'dev',
    purpose: 'Internal staff workflows and administration',
  },
  {
    hub: 'website',
    repository: 'headstart-health-website',
    baseline: 'dev',
    purpose: 'Public website, campaigns and lead experiences',
  },
  {
    hub: 'salesforce',
    repository: 'salesforce-dev',
    baseline: 'dev',
    purpose: 'Salesforce configuration and integrations',
  },
];

export const repositoryFor = (hub: string): WorkspaceRepository => {
  const repository = WORKSPACE_REPOSITORIES.find((item) => item.hub === hub);
  if (!repository) throw new Error(`Unknown repository hub: ${hub}`);
  return repository;
};

export const repositoryUrl = (repository: WorkspaceRepository): string =>
  `https://github.com/headstartHealthTeam/${repository.repository}.git`;

export const selectRepositories = (selection: string): readonly WorkspaceRepository[] => {
  if (selection === 'all') return WORKSPACE_REPOSITORIES;
  if (selection === 'none') return [];
  return [...new Set(selection.split(','))].map(repositoryFor);
};
