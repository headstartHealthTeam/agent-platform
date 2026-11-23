import { describe, expect, it } from 'vitest';

import { browserFunctionDefinition } from './function-definition.js';
import { browserAction } from './session.js';

describe('generic application browser function', () => {
  it('exposes native tasks and inspection, never provider selection or credentials', () => {
    expect(browserFunctionDefinition.type).toBe('function');
    expect(browserFunctionDefinition.name).toBe('operate_application_browser');
    expect(Object.keys(browserFunctionDefinition.parameters.properties)).toEqual([
      'kind',
      'task',
      'requirementIds',
      'attachmentIds',
    ]);
    expect(browserFunctionDefinition.parameters.properties.kind.enum).toContain('computer');
    expect(browserFunctionDefinition.parameters.additionalProperties).toBe(false);
    expect(browserAction.safeParse({ kind: 'inspect' }).success).toBe(true);
    expect(
      browserAction.safeParse({ kind: 'fill', selector: '#observed', value: 'Synthetic' }).success
    ).toBe(true);
    expect(browserAction.safeParse({ kind: 'inspect', url: 'https://payer.example' }).success).toBe(
      false
    );
  });
});
