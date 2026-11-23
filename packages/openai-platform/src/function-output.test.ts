import { AGENT_FUNCTION_CONTENT_LIMIT } from '@headstart-health/workflow-contracts';
import type { AgentFunctionCallOutputParam } from 'openai/resources/beta/agents/agents';
import { describe, expect, it } from 'vitest';

import { functionOutput } from './function-output.js';

const image = 'data:image/png;base64,iVBORw0KGgo=';

describe('visual function results', () => {
  it('preserves the official SDK content array rather than stringifying image inputs', () => {
    const input = [
      { type: 'input_text', text: 'Synthetic form: name and office fields.' },
      { type: 'input_image', image_url: image },
    ] satisfies AgentFunctionCallOutputParam;
    const output: AgentFunctionCallOutputParam = functionOutput.parse(input);
    expect(output).toEqual(input);
    expect(functionOutput.parse('Existing text-only output')).toBe('Existing text-only output');
  });

  it.each(
    [
      [],
      [{ type: 'input_text', text: 'x', extra: true }],
      [{ type: 'output_text', text: 'Wrong direction' }],
      [{ type: 'input_image', image_url: 'https://example.com/private-image' }],
      [{ type: 'input_image', image_url: 'file:///private/image.png' }],
      [{ type: 'input_image', image_url: 'data:image/svg+xml;base64,PHN2Zz4=' }],
      [{ type: 'input_image', image_url: 'data:image/png;base64,a' }],
      [{ type: 'input_image', image_url: 'data:image/png;base64,' }],
      [{ type: 'input_image', image_url: 'data:image/png;base64,Zg===' }],
      [{ type: 'input_image', image_url: image, detail: 'invented-field' }],
      Array.from({ length: 17 }, () => ({ type: 'input_text', text: 'x' })),
    ].map((input) => ({ input }))
  )('rejects unsupported or malformed visual content: $input', ({ input }) => {
    expect(functionOutput.safeParse(input).success).toBe(false);
  });

  it('counts the complete UTF-8 content envelope and leaves provider metadata headroom', () => {
    const envelopeSize = Buffer.byteLength(JSON.stringify([{ type: 'input_text', text: '' }]));
    const atLimit = [
      { type: 'input_text', text: 'x'.repeat(AGENT_FUNCTION_CONTENT_LIMIT - envelopeSize) },
    ];
    expect(functionOutput.safeParse(atLimit).success).toBe(true);
    expect(
      functionOutput.safeParse([{ type: 'input_text', text: `${atLimit[0]?.text ?? ''}x` }]).success
    ).toBe(false);
    expect(
      functionOutput.safeParse([
        { type: 'input_text', text: '界'.repeat(Math.ceil(AGENT_FUNCTION_CONTENT_LIMIT / 3)) },
      ]).success
    ).toBe(false);
    expect(
      functionOutput.safeParse([
        {
          type: 'input_image',
          image_url: `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024).toString('base64')}`,
        },
      ]).success
    ).toBe(false);
  });
});
