export interface ReplayCounts {
  readonly completedRows?: number;
  readonly totalRows?: number;
  readonly transcripts?: number;
}
export interface ReplayProgressEvent {
  readonly event: 'fireflies-replay-progress';
  readonly phase: string;
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly completedRows: number;
  readonly totalRows: number;
  readonly transcripts: number;
}
export interface ReplayTiming {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly elapsedMs: number;
  readonly phaseDurationsMs: Readonly<Record<string, number>>;
}
export interface ReplayProgress {
  readonly progress: (
    input?: ReplayCounts & { readonly nextPhase?: string; readonly force?: boolean }
  ) => void;
  readonly finish: (counts: ReplayCounts) => ReplayTiming;
}
/** Counts/timing only, preserving the original progress contract without identities, text or paths. */
export function createReplayProgress({
  now = (): Date => new Date(),
  monotonic = (): number => performance.now(),
  emit = (event: ReplayProgressEvent): void => {
    process.stderr.write(`${JSON.stringify(event)}\n`);
  },
  intervalMs = 5000,
}: {
  readonly now?: () => Date;
  readonly monotonic?: () => number;
  readonly emit?: (event: ReplayProgressEvent) => void;
  readonly intervalMs?: number;
} = {}): ReplayProgress {
  const startedAt = now().toISOString();
  const started = monotonic();
  let last = -Infinity;
  let phase = 'waiting-for-run-lock';
  let phaseStarted = started;
  const phaseDurationsMs: Record<string, number> = {};
  const progress: ReplayProgress['progress'] = ({
    nextPhase = phase,
    completedRows = 0,
    totalRows = 0,
    transcripts = 0,
    force = false,
  } = {}) => {
    const time = monotonic();
    if (nextPhase !== phase) {
      Reflect.set(phaseDurationsMs, phase, Math.round(time - phaseStarted));
      phase = nextPhase;
      phaseStarted = time;
      force = true;
    }
    if (!force && time - last < intervalMs) return;
    last = time;
    emit({
      event: 'fireflies-replay-progress',
      phase,
      startedAt,
      elapsedMs: Math.round(time - started),
      completedRows,
      totalRows,
      transcripts,
    });
  };
  progress({ force: true });
  return {
    progress,
    finish(counts): ReplayTiming {
      progress({ ...counts, nextPhase: 'complete', force: true });
      return {
        startedAt,
        completedAt: now().toISOString(),
        elapsedMs: Math.round(monotonic() - started),
        phaseDurationsMs,
      };
    },
  };
}
