import { describe, expect, it } from 'vitest';

import { operatorCommandLabel } from './operator-command-label.js';

describe('bounded workspace command labels', () => {
  it.each([
    ["/bin/bash -lc 'python3 /workspace/private.py'", 'Run a Python workspace script'],
    ['sh -c "headstart-document private.pdf"', 'Read a document in the workspace'],
    ['zsh -lc "sha256sum private.pdf"', 'Verify file hashes'],
    ['headstart-mcp-document private-request.json', 'Retrieve an authorized source document'],
    ['headstart-drive-read private-request.json', 'Read authorized Drive evidence'],
  ])('classifies a literal executable without exposing its arguments', (command, label) => {
    expect(operatorCommandLabel(command)).toBe(label);
    expect(operatorCommandLabel(command)).not.toContain('private');
  });
  it.each([
    undefined,
    '',
    'x'.repeat(100_001),
    'constructor',
    'TOKEN=secret python3',
    '/private/python3 file',
    'bash -c python3',
    "bash -lc 'python3' trailing",
    "bash -lc 'python3 $TOKEN'",
    "bash -lc 'python3; other-command'",
    "bash -lc 'python3 | other-command'",
    'node > file',
    'python3\nother-command',
    "bash -lc 'python3 'mixed' text'",
    'bash -lc "node `command`"',
  ])('keeps ambiguous commands generic', (command) => {
    expect(operatorCommandLabel(command)).toBe('Workspace command');
  });
});
