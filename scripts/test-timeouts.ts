export const UNIT_TEST_TIMEOUT = 15_000;
export const GIT_COMMAND_TIMEOUT = 30_000;

export const gitWorkflowTestTimeoutForPlatform = (platform: NodeJS.Platform): number =>
  platform === 'win32' ? 120_000 : 30_000;
