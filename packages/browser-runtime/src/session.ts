import { z } from 'zod';

import type { BrowserComputerObservation, BrowserEntryReadback } from './entry-contract.js';

export const browserAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inspect') }).strict(),
  z
    .object({
      kind: z.literal('target'),
      observationId: z.uuid(),
      targetId: z.uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('navigate'),
      observationId: z.uuid(),
      selector: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal('fill'),
      selector: z.string().min(1).max(500),
      value: z.string().max(8000),
      observationId: z.uuid().optional(),
      approvedOrigin: z.url().optional(),
    })
    .strict(),
  z.object({ kind: z.literal('click'), selector: z.string().min(1).max(500) }).strict(),
  z
    .object({
      kind: z.literal('select'),
      selector: z.string().min(1).max(500),
      value: z.string().max(500),
      observationId: z.uuid().optional(),
      approvedOrigin: z.url().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('upload'),
      observationId: z.uuid(),
      approvedOrigin: z.url().optional(),
      selector: z.string().min(1).max(500),
      files: z
        .array(
          z
            .object({
              name: z.string().min(1).max(200),
              content: z.string().min(1).max(70_000_000),
              mimeType: z.string().min(1).max(200),
              digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            })
            .strict()
        )
        .min(1)
        .max(10),
    })
    .strict(),
]);
export type BrowserAction = z.infer<typeof browserAction>;
export interface BrowserInspection extends BrowserComputerObservation {
  /** Transport evidence only, not payer acceptance. Contains no file bytes or entered values. */
  readback?: BrowserEntryReadback;
}
export interface BrowserWatchReceipt {
  liveURL: string;
  liveURLId: string;
  notAfter: number;
}

/** Internal transport seam. The application journals and authorizes each call before using it. */
export interface BrowserConnection {
  inspectComputer?: (afterInput?: boolean) => Promise<BrowserInspection>;
  computer?: (
    action: unknown,
    values: readonly string[],
    beforeInput?: () => Promise<void>
  ) => Promise<void>;
  validateComputer?: (action: unknown, values: readonly string[]) => Promise<void>;
  uploadComputer?: (
    point: { x: number; y: number },
    files: Extract<BrowserAction, { kind: 'upload' }>['files'],
    beforeInput?: () => Promise<void>
  ) => Promise<void>;
  hasPendingDialog?: () => Promise<boolean>;
  inspectHandoff?: () => Promise<BrowserInspection>;
  verifyHandoff?: () => Promise<void>;
  inspect: () => Promise<BrowserInspection>;
  act: (action: Exclude<BrowserAction, { kind: 'inspect' }>) => Promise<void>;
  watch: (timeoutMs: number) => Promise<{ liveURL: string; liveURLId: string; timeout: number }>;
  human: (timeoutMs: number) => Promise<{ liveURL: string; liveURLId: string; timeout: number }>;
  closeViewer: (liveURLId: string) => Promise<void>;
  close: () => Promise<void>;
  /** Optional non-mutating admission; rejection must occur before an action journal is dispatched. */
  validate?: (action: BrowserAction) => Promise<void>;
}
export type BrowserSessionFailure =
  'invalid_action' | 'busy' | 'human_control' | 'ended' | 'read_failed' | 'dispatch_uncertain';
type BrowserSessionPhase =
  | 'connection'
  | 'protocol'
  | 'page'
  | 'fixture'
  | 'viewer'
  | 'authentication'
  | 'handoff-revocation'
  | 'handoff-observation'
  | 'handoff-viewer'
  | 'tab-selection'
  | 'pre-input-observation'
  | 'input-focus'
  | 'reviewed-origin';
export class BrowserSessionError extends Error {
  constructor(
    public readonly code: BrowserSessionFailure,
    public readonly phase?: BrowserSessionPhase
  ) {
    super(`Browser session: ${code}`);
    this.name = 'BrowserSessionError';
  }
}

/** One controller, no implicit action replay or browser replacement. Stop also closes the viewer. */
export class OwnedBrowserSession {
  #busy = false;
  #ended = false;
  #uncertain = false;
  #watchViewer: BrowserWatchReceipt | undefined;
  #humanControl = false;
  #handoffEpoch = 0;
  #humanViewer: BrowserWatchReceipt | undefined;
  #revokedPrivateViewer: BrowserWatchReceipt | undefined;
  #closing: Promise<void> | undefined;
  readonly #expiry: ReturnType<typeof setTimeout>;

  constructor(
    private readonly connection: BrowserConnection,
    public readonly notAfter: number,
    initiallyPrivate = false
  ) {
    const remaining = notAfter - Date.now();
    if (!Number.isSafeInteger(notAfter) || remaining <= 0 || remaining > 2_147_483_647)
      throw new BrowserSessionError('ended');
    this.#humanControl = initiallyPrivate;
    this.#expiry = setTimeout(() => {
      this.stop().catch(() => {
        /* Owner retains uncertain close. */
      });
    }, remaining);
    this.#expiry.unref();
  }

  async execute(input: unknown): Promise<BrowserInspection> {
    if (this.#humanControl) throw new BrowserSessionError('human_control');
    const parsed = browserAction.safeParse(input);
    if (!parsed.success) throw new BrowserSessionError('invalid_action');
    return this.exclusive(parsed.data.kind === 'inspect', async () => {
      if (parsed.data.kind !== 'inspect') {
        await this.connection.act(parsed.data);
        this.requireActive();
      }
      return this.connection.inspect();
    });
  }

  async inspectComputer(): Promise<BrowserInspection> {
    if (this.#humanControl) throw new BrowserSessionError('human_control');
    return this.exclusive(true, async () => {
      if (!this.connection.inspectComputer) throw new BrowserSessionError('invalid_action');
      return this.connection.inspectComputer();
    });
  }

  async validateComputer(action: unknown, values: readonly string[]): Promise<void> {
    this.requireActive();
    if (this.#humanControl) throw new BrowserSessionError('human_control');
    if (!this.connection.validateComputer) throw new BrowserSessionError('invalid_action');
    await this.connection.validateComputer(action, values);
  }

  async computer(
    action: unknown,
    values: readonly string[],
    expectedObservation?: BrowserComputerObservation
  ): Promise<BrowserInspection> {
    const epoch = this.#handoffEpoch;
    try {
      await this.validateComputer(action, values);
    } catch (error) {
      this.requireActive();
      if (this.#humanControl || epoch !== this.#handoffEpoch)
        throw new BrowserSessionError('human_control');
      if (expectedObservation) {
        const changed = await this.changedObservation(expectedObservation, () =>
          this.inspectComputer()
        );
        if (changed instanceof BrowserSessionError) throw changed;
        if (changed) return changed;
      }
      throw error;
    }
    if (this.#humanControl || epoch !== this.#handoffEpoch)
      throw new BrowserSessionError('human_control');
    return this.nativeInput(async (beforeInput) => {
      if (!this.connection.computer) throw new BrowserSessionError('invalid_action');
      await this.connection.computer(action, values, beforeInput);
    }, expectedObservation);
  }

  async uploadComputer(
    point: { x: number; y: number },
    files: Extract<BrowserAction, { kind: 'upload' }>['files'],
    expectedObservation?: BrowserComputerObservation
  ): Promise<BrowserInspection> {
    this.requireActive();
    if (this.#humanControl) throw new BrowserSessionError('human_control');
    return this.nativeInput(async (beforeInput) => {
      if (!this.connection.uploadComputer) throw new BrowserSessionError('invalid_action');
      await this.connection.uploadComputer(point, files, beforeInput);
    }, expectedObservation);
  }

  /** Only called while the transport still owes its first input. Never return withheld pixels. */
  private async inspectBeforeInput(
    inspect: () => Promise<BrowserInspection>
  ): Promise<BrowserInspection | BrowserSessionError> {
    const current = await inspect().catch(
      () => new BrowserSessionError('read_failed', 'pre-input-observation')
    );
    this.requireActive();
    if (this.#humanControl) throw new BrowserSessionError('human_control');
    return current;
  }

  private async changedObservation(
    expected: BrowserComputerObservation,
    inspect: () => Promise<BrowserInspection>
  ): Promise<BrowserInspection | BrowserSessionError | undefined> {
    const current = await this.inspectBeforeInput(inspect);
    if (current instanceof BrowserSessionError) return current;
    if (
      expected.text !== current.text ||
      expected.image !== current.image ||
      !!expected.pauseBatch !== !!current.pauseBatch
    )
      return { ...current, dispatched: false };
    return undefined;
  }

  private async nativeInput(
    dispatch: (beforeInput?: () => Promise<void>) => Promise<void>,
    expected?: BrowserComputerObservation
  ): Promise<BrowserInspection> {
    const result = await this.exclusive(false, async () => {
      if (!this.connection.inspectComputer) throw new BrowserSessionError('invalid_action');
      const inspect = this.connection.inspectComputer.bind(this.connection);
      const obsolete = new BrowserSessionError('invalid_action');
      let changed: BrowserInspection | BrowserSessionError | undefined;
      const refresh =
        expected &&
        (async (): Promise<void> => {
          changed = await this.changedObservation(expected, inspect);
          if (changed) throw obsolete;
        });
      try {
        await dispatch(refresh);
      } catch (error) {
        if (error === obsolete && changed) return changed;
        // Only the driver's confirmed pre-input rejection leaves this session inspectable.
        if (
          error instanceof BrowserSessionError &&
          error.code === 'invalid_action' &&
          (error.phase === 'tab-selection' || error.phase === 'input-focus')
        ) {
          if (!expected) return error;
          const current = await this.inspectBeforeInput(inspect);
          if (current instanceof BrowserSessionError) return current;
          return { ...current, dispatched: false as const };
        }
        throw error;
      }
      this.requireActive();
      return this.connection.inspectComputer(true);
    });
    if (result instanceof BrowserSessionError) throw result;
    return result;
  }

  async validate(input: unknown): Promise<void> {
    this.requireActive();
    if (this.#humanControl) throw new BrowserSessionError('human_control');
    const parsed = browserAction.safeParse(input);
    if (!parsed.success) throw new BrowserSessionError('invalid_action');
    await this.connection.validate?.(parsed.data);
  }

  async watch(): Promise<BrowserWatchReceipt> {
    if (this.#humanControl) throw new BrowserSessionError('human_control');
    return this.exclusive(false, async () => {
      if (this.#watchViewer) {
        await this.connection.closeViewer(this.#watchViewer.liveURLId);
        this.#watchViewer = undefined;
        this.requireActive();
      }
      const started = Date.now();
      const receipt = await this.connection.watch(this.notAfter - started);
      // Retain a receipt even if Stop raced the call. The application must not expose it after Stop.
      this.#watchViewer = {
        liveURL: receipt.liveURL,
        liveURLId: receipt.liveURLId,
        notAfter: Math.min(this.notAfter, started + receipt.timeout),
      };
      return this.#watchViewer;
    });
  }

  /** Revoke the existing viewer before issuing private control; never upgrade a shared URL. */
  async startHumanControl(): Promise<BrowserWatchReceipt> {
    this.requireActive();
    if (this.#busy) throw new BrowserSessionError('busy');
    if (this.#humanViewer) {
      if (Date.now() >= this.#humanViewer.notAfter) throw new BrowserSessionError('ended');
      return this.#humanViewer;
    }
    return this.exclusive(false, async () => {
      this.#humanControl = true;
      this.#handoffEpoch++;
      const previousWatch = this.#watchViewer;
      if (this.#watchViewer) {
        await this.connection.closeViewer(this.#watchViewer.liveURLId);
        this.requireActive();
        this.#watchViewer = undefined;
      }
      const started = Date.now();
      const receipt = await this.connection.human(this.notAfter - started);
      if (
        [previousWatch, this.#revokedPrivateViewer].some(
          (previous) =>
            previous &&
            (receipt.liveURLId === previous.liveURLId || receipt.liveURL === previous.liveURL)
        )
      ) {
        await this.connection.closeViewer(receipt.liveURLId);
        throw new BrowserSessionError('dispatch_uncertain', 'handoff-revocation');
      }
      this.#revokedPrivateViewer = undefined;
      this.#humanViewer = {
        liveURL: receipt.liveURL,
        liveURLId: receipt.liveURLId,
        notAfter: Math.min(this.notAfter, started + receipt.timeout),
      };
      return this.#humanViewer;
    });
  }

  /** No page read occurs until the provider acknowledges revoking interactive access. */
  async resumeAutomation(): Promise<BrowserWatchReceipt> {
    const observationPhase = 'handoff-observation';
    this.requireActive();
    if (this.#busy) throw new BrowserSessionError('busy');
    const viewer = this.#humanViewer;
    if (!this.#humanControl || !viewer) throw new BrowserSessionError('invalid_action');
    // Before revocation, only consult tracked dialog metadata. The private viewer can still clear it.
    if (this.connection.hasPendingDialog && (await this.connection.hasPendingDialog()))
      throw new BrowserSessionError('human_control', observationPhase);
    if (viewer !== this.#humanViewer) throw new BrowserSessionError('invalid_action');
    const result = await this.exclusive(false, async () => {
      let phase: BrowserSessionPhase = 'handoff-revocation';
      try {
        await this.connection.closeViewer(viewer.liveURLId);
        this.#revokedPrivateViewer = viewer;
        this.#humanViewer = undefined;
        this.requireActive();
        // Revocation alone does not mean login finished. Keep all shared capabilities withheld
        // until a fresh observation succeeds, including authentication checks in every frame.
        phase = observationPhase;
        const observation = await (this.connection.inspectHandoff?.() ?? this.connection.inspect());
        if (observation.pauseBatch) throw new BrowserSessionError('human_control', phase);
        await this.connection.verifyHandoff?.();
        const started = Date.now();
        this.requireActive();
        phase = 'handoff-viewer';
        const receipt = await this.connection.watch(this.notAfter - started);
        this.#humanControl = false;
        this.#watchViewer = {
          liveURL: receipt.liveURL,
          liveURLId: receipt.liveURLId,
          notAfter: Math.min(this.notAfter, started + receipt.timeout),
        };
        return this.#watchViewer;
      } catch (error) {
        // Revocation succeeded and no shared link was requested. Explicit private-page evidence
        // allows the operator to obtain a fresh private viewer without repeating revocation.
        if (
          error instanceof BrowserSessionError &&
          error.code === 'human_control' &&
          error.phase === 'reviewed-origin' &&
          (phase === observationPhase || phase === 'handoff-viewer')
        )
          return new BrowserSessionError('human_control', observationPhase);
        if (
          phase === observationPhase &&
          error instanceof BrowserSessionError &&
          error.code === 'human_control' &&
          (error.phase === 'authentication' || error.phase === phase)
        )
          return error;
        throw new BrowserSessionError(
          'dispatch_uncertain',
          error instanceof BrowserSessionError ? (error.phase ?? phase) : phase
        );
      }
    });
    if (result instanceof BrowserSessionError) throw result;
    return result;
  }

  async stop(): Promise<void> {
    this.#ended = true;
    clearTimeout(this.#expiry);
    // Coalesce Stop callers, but a rejected close remains reconcilable on this same connection.
    this.#closing ??= this.connection.close().catch(() => {
      this.#closing = undefined;
      throw new BrowserSessionError('dispatch_uncertain');
    });
    return this.#closing;
  }

  private requireActive(): void {
    if (this.#ended || this.#uncertain || Date.now() >= this.notAfter)
      throw new BrowserSessionError('ended');
  }

  private async exclusive<T>(read: boolean, operation: () => Promise<T>): Promise<T> {
    this.requireActive();
    if (this.#busy) throw new BrowserSessionError('busy');
    this.#busy = true;
    try {
      return await operation();
    } catch (error) {
      if (!read) this.#uncertain = true;
      throw new BrowserSessionError(
        read ? 'read_failed' : 'dispatch_uncertain',
        error instanceof BrowserSessionError ? error.phase : undefined
      );
    } finally {
      this.#busy = false;
    }
  }
}
