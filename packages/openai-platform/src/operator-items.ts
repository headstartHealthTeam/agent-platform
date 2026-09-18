import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const itemBase = z.object({ id, turn_id: id, type: z.string() });
const message = itemBase.extend({
  type: z.literal('message'),
  role: z.literal('assistant'),
  phase: z.enum(['commentary', 'final_answer']),
  status: z.enum(['in_progress', 'completed', 'incomplete']),
  content: z
    .array(z.object({ type: z.literal('output_text'), text: z.string().max(10000) }))
    .max(1),
});
const command = itemBase.extend({
  type: z.literal('command_execution'),
  status: z.enum(['in_progress', 'completed', 'incomplete', 'failed']),
});
const event = z.object({ event_id: id, session_id: id, turn_id: id.nullable(), type: z.string() });
const textEvent = event.extend({
  item_id: id,
  content_index: z.literal(0),
  delta: z.string().max(10000).optional(),
  text: z.string().max(10000).optional(),
});

export interface OperatorItem {
  id: string;
  kind: 'commentary' | 'tool' | 'final' | 'question';
  text: string;
  final: boolean;
  callFingerprint?: string;
}
export const operatorText = (value: string): string =>
  /sk-|Bearer\s|-----BEGIN .*PRIVATE KEY/i.test(value) ? '[Sensitive content withheld]' : value;

/** Allowlisted explanatory content only. Never expose reasoning, shell arguments or raw outputs. */
export class OperatorItems {
  private readonly items = new Map<string, OperatorItem>();
  private readonly seen = new Set<string>();
  private readonly liveText = new Set<string>();
  private readonly withheld = new Set<string>();
  private readonly turns = new Set<string>();
  constructor(
    private readonly sessionId: string,
    turnId: string
  ) {
    this.turns.add(turnId);
  }
  /** Called only after the adapter verifies the session's complete ordered root-turn history. */
  includeTurns(turnIds: string[]): void {
    for (const turnId of turnIds) this.turns.add(id.parse(turnId));
  }
  values(): OperatorItem[] {
    return [...this.items.values()];
  }
  recover(rawItems: unknown[]): void {
    for (const item of rawItems) this.item(item, false);
  }
  consume(raw: unknown): void {
    const header = z.object({ type: z.string() }).parse(raw);
    if (
      ![
        'agent.session.turn.item.added',
        'agent.session.turn.item.done',
        'agent.session.turn.output_text.delta',
        'agent.session.turn.output_text.done',
      ].includes(header.type)
    )
      return;
    const parsed = event.parse(raw);
    if (parsed.session_id !== this.sessionId) throw new Error('Wrong observation session');
    if (!parsed.turn_id || !this.turns.has(parsed.turn_id) || this.seen.has(parsed.event_id))
      return;
    if (this.seen.size >= 10000) throw new Error('Observation limit reached; recover saved state');
    this.seen.add(parsed.event_id);
    if (parsed.type.endsWith('item.added') || parsed.type.endsWith('item.done')) {
      this.item(z.object({ item: z.unknown() }).parse(raw).item, true);
      return;
    }
    const update = textEvent.parse(raw);
    const previous = this.items.get(update.item_id);
    if (!previous || previous.kind === 'tool' || previous.final) return;
    // History may contain an overlapping partial message. Do not guess delta offsets after
    // reconnect: wait for the full text.done/item.done when the opening item was missed.
    if (!this.liveText.has(previous.id) && !parsed.type.endsWith('.done')) return;
    const text = parsed.type.endsWith('.done') ? update.text : previous.text + (update.delta ?? '');
    if (text === undefined || text.length > 10000) throw new Error('Invalid text update');
    this.items.set(previous.id, { ...previous, text: this.text(previous.id, text) });
  }
  private text(itemId: string, value: string): string {
    const result = operatorText(value);
    if (result !== value) this.withheld.add(itemId);
    return this.withheld.has(itemId) ? '[Sensitive content withheld]' : value;
  }
  private item(raw: unknown, live: boolean): void {
    const base = itemBase.safeParse(raw);
    if (!base.success || !this.turns.has(base.data.turn_id)) return;
    let next: OperatorItem;
    if (base.data.type === 'message') {
      const projected = this.message(raw, live);
      if (!projected) return;
      next = projected;
    } else if (base.data.type === 'command_execution') {
      const item = command.parse(raw);
      next = {
        id: item.id,
        kind: 'tool',
        text:
          item.status === 'in_progress'
            ? 'Agent is using a tool.'
            : 'Tool activity ended. Review the agent’s explanation and evidence for the outcome.',
        final: item.status !== 'in_progress',
      };
    } else return;
    const previous = this.items.get(next.id);
    if (previous?.final) return;
    if (!previous && this.items.size >= 180) throw new Error('Activity limit reached');
    this.items.set(next.id, next);
  }
  private message(raw: unknown, live: boolean): OperatorItem | null {
    const parsed = message.safeParse(raw);
    if (!parsed.success) return null;
    const item = parsed.data;
    const completed = item.status !== 'in_progress';
    if (!live && !completed && this.items.has(item.id)) return null;
    if (live && !completed && !this.items.has(item.id)) this.liveText.add(item.id);
    return {
      id: item.id,
      kind: item.phase === 'commentary' ? 'commentary' : 'final',
      text:
        !live && !completed
          ? 'Agent is writing an update…'
          : this.text(item.id, item.content.map((part) => part.text).join('')),
      final: completed,
    };
  }
}
