import type { OpenAIPlatform } from './platform.js';

type Reader = Pick<OpenAIPlatform, 'read' | 'openOperatorObservation'>;

/** One observation budget covers project checks, pagination and parallel reads. Abort and settle
 * every started request before returning, so application observation leases remain truthful.
 * This cancels observation only, never the hosted agent or an input command.
 */
export async function operatorReadBudget<T>(
  platform: Reader,
  action: (reader: Reader) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const pending = new Set<Promise<unknown>>();
  const timer = setTimeout(() => {
    controller.abort();
  }, 45_000);
  const track = <V>(start: () => Promise<V>): Promise<V> => {
    controller.signal.throwIfAborted();
    const result = start().finally(() => {
      pending.delete(result);
    });
    pending.add(result);
    return result;
  };
  try {
    const result = await action({
      read: (input) => track(() => platform.read(input, controller.signal)),
      openOperatorObservation: (binding) =>
        track(() => platform.openOperatorObservation(binding, controller.signal)),
    });
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    if (!controller.signal.aborted) throw error;
    throw Object.assign(new Error('Operator observation timed out'), {
      code: 'operator-observation-timeout',
    });
  } finally {
    clearTimeout(timer);
    controller.abort();
    await Promise.allSettled([...pending]);
  }
}
