import type {
  BoundPortalExecution,
  PortalInventoryExecution,
  PortalInventoryInput,
} from './portal-collection-types.js';

function invalidKey(key: unknown): boolean {
  return typeof key !== 'string' || !key.trim();
}
function executionKey(execution: PortalInventoryExecution | null | undefined): string | undefined {
  return execution?.requestKey;
}
function validateChat(chat: unknown, parent: string): void {
  if (
    chat === null ||
    typeof chat !== 'object' ||
    Array.isArray(chat) ||
    ('requestKey' in chat &&
      chat.requestKey !== null &&
      chat.requestKey !== undefined &&
      chat.requestKey !== '' &&
      chat.requestKey !== parent)
  ) {
    throw new Error('Portal chat request key conflicts with its parent request.');
  }
}
function validateExecution(execution: PortalInventoryExecution): void {
  if (
    !Array.isArray(execution.chats) &&
    (execution.status === 'Complete' || (execution.chats !== null && execution.chats !== undefined))
  )
    throw new Error('Portal inventory requires an explicit chat array for a completed request.');
}
export function bindPortalRequestKeys({
  plan,
  inventory = [],
}: PortalInventoryInput = {}): BoundPortalExecution[] {
  const keys = (plan?.requests ?? []).map((request) => request.requestKey);
  if (keys.some(invalidKey) || new Set(keys).size !== keys.length)
    throw new Error('Portal plan contains missing or duplicate request keys.');
  const planned = new Set(keys);
  const seen = new Set<string>();
  return inventory.map((execution) => {
    const key = executionKey(execution);
    if (key === undefined || !planned.has(key) || seen.has(key))
      throw new Error('Portal inventory contains an unknown or duplicate parent request key.');
    seen.add(execution.requestKey);
    validateExecution(execution);
    return {
      ...execution,
      chats: (execution.chats ?? []).map((chat) => {
        validateChat(chat, execution.requestKey);
        return { ...chat, requestKey: execution.requestKey };
      }),
    };
  });
}
export interface PortalSentinelResult {
  readonly plannedSentinelRequestKey: string | null;
  readonly sentinelRequestKey: string | null;
  readonly plannedSentinelFound: boolean;
  readonly sentinelFound: boolean;
  readonly fallbackUsed: boolean;
  readonly recoveredRecords: number;
}
export function evaluatePortalSentinel(input: PortalInventoryInput = {}): PortalSentinelResult {
  const inventory = bindPortalRequestKeys(input);
  const plannedSentinelRequestKey = input.plan?.sentinelRequestKey ?? null;
  const requestByKey = new Map(
    (input.plan?.requests ?? []).map((request) => [request.requestKey, request])
  );
  const completed = inventory.filter(
    (execution) =>
      requestByKey.has(execution.requestKey) &&
      execution.status === 'Complete' &&
      execution.paginationComplete !== false
  );
  const plannedExecution = completed.find(
    (execution) => execution.requestKey === plannedSentinelRequestKey
  );
  const plannedSentinelFound = (plannedExecution?.chats.length ?? 0) > 0;
  // The original positive control may be legitimately empty in this frozen window.
  const fallbackExecution = completed.find((execution) => execution.chats.length > 0);
  const healthExecution = plannedSentinelFound ? plannedExecution : fallbackExecution;
  return {
    plannedSentinelRequestKey,
    sentinelRequestKey: healthExecution?.requestKey ?? plannedSentinelRequestKey,
    plannedSentinelFound,
    sentinelFound: Boolean(healthExecution),
    fallbackUsed:
      Boolean(healthExecution) && healthExecution?.requestKey !== plannedSentinelRequestKey,
    recoveredRecords: healthExecution?.chats.length ?? 0,
  };
}
