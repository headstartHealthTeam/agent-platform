import { z } from 'zod';

import type { BrowserEntryReadback } from './entry-contract.js';

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
export interface BrowserInspection {
  text: string;
  image: string;
  pauseBatch?: boolean;
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
  inspectComputer?: () => Promise<BrowserInspection>;
  computer?: (action: unknown, values: readonly string[]) => Promise<void>;
  validateComputer?: (action: unknown, values: readonly string[]) => Promise<void>;
  uploadComputer?: (
    point: { x: number; y: number },
    files: Extract<BrowserAction, { kind: 'upload' }>['files']
  ) => Promise<void>;
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
  | 'handoff-viewer';
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
  #humanViewer: BrowserWatchReceipt | undefined;
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
      if (parsed.data.kind !== 'inspect') await this.connection.act(parsed.data);
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

  async computer(action: unknown, values: readonly string[]): Promise<BrowserInspection> {
    await this.validateComputer(action, values);
    return this.exclusive(false, async () => {
      if (!this.connection.computer || !this.connection.inspectComputer)
        throw new BrowserSessionError('invalid_action');
      await this.connection.computer(action, values);
      return this.connection.inspectComputer();
    });
  }

  async uploadComputer(
    point: { x: number; y: number },
    files: Extract<BrowserAction, { kind: 'upload' }>['files']
  ): Promise<BrowserInspection> {
    this.requireActive();
    if (this.#humanControl) throw new BrowserSessionError('human_control');
    return this.exclusive(false, async () => {
      if (!this.connection.uploadComputer || !this.connection.inspectComputer)
        throw new BrowserSessionError('invalid_action');
      await this.connection.uploadComputer(point, files);
      return this.connection.inspectComputer();
    });
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
    if (this.#humanViewer) return this.#humanViewer;
    return this.exclusive(false, async () => {
      this.#humanControl = true;
      const previousWatch = this.#watchViewer;
      if (this.#watchViewer) {
        await this.connection.closeViewer(this.#watchViewer.liveURLId);
        this.requireActive();
        this.#watchViewer = undefined;
      }
      const started = Date.now();
      const receipt = await this.connection.human(this.notAfter - started);
      if (
        previousWatch &&
        (receipt.liveURLId === previousWatch.liveURLId || receipt.liveURL === previousWatch.liveURL)
      ) {
        await this.connection.closeViewer(receipt.liveURLId);
        throw new BrowserSessionError('dispatch_uncertain', 'handoff-revocation');
      }
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
    const viewer = this.#humanViewer;
    if (!this.#humanControl || !viewer) throw new BrowserSessionError('invalid_action');
    return this.exclusive(false, async () => {
      let phase: BrowserSessionPhase = 'handoff-revocation';
      try {
        await this.connection.closeViewer(viewer.liveURLId);
        this.requireActive();
        // Revocation alone does not mean login finished. Keep all shared capabilities withheld
        // until a fresh observation succeeds, including authentication checks in every frame.
        phase = 'handoff-observation';
        await this.connection.inspect();
        const started = Date.now();
        this.requireActive();
        phase = 'handoff-viewer';
        const receipt = await this.connection.watch(this.notAfter - started);
        this.#humanControl = false;
        this.#humanViewer = undefined;
        this.#watchViewer = {
          liveURL: receipt.liveURL,
          liveURLId: receipt.liveURLId,
          notAfter: Math.min(this.notAfter, started + receipt.timeout),
        };
        return this.#watchViewer;
      } catch (error) {
        throw new BrowserSessionError(
          'dispatch_uncertain',
          error instanceof BrowserSessionError ? (error.phase ?? phase) : phase
        );
      }
    });
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
