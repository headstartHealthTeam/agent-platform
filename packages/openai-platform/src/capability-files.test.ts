import type { AgentCapabilityFiles } from '@headstart-health/workflow-contracts';
import { describe, expect, it } from 'vitest';

import { bindCapabilityFiles } from './capability-files.js';
import { actionSchema, type Action } from './operations.js';

const root = '/workspace/workflow';
const bundle: AgentCapabilityFiles = {
  directories: [`${root}/skills`],
  files: [
    {
      path: `${root}/skills/example/SKILL.md`,
      data: Buffer.from('Synthetic skill').toString('base64'),
    },
  ],
};
function action(
  environment: unknown = { type: 'openai_hosted' }
): Extract<Action, { operation: 'sessions.create' }> {
  const value = actionSchema.parse({
    operation: 'sessions.create',
    body: { agent_id: 'synthetic', input: 'Synthetic only', environment },
  });
  if (value.operation !== 'sessions.create') throw new Error('Expected session creation');
  return value;
}
describe('hosted capability source installation', () => {
  it('keeps normal tool setup and existing discovery while installing exact source bytes', () => {
    const configured = {
      type: 'openai_hosted',
      files: [{ type: 'inline', path: '/workspace/config.json', data: 'e30=' }],
      capability_directories: ['/workspace/tools/skills'],
      packages: { npm: ['synthetic@1.0.0'] },
      setup_commands: [{ command: 'true' }],
    };
    const prepared = action(configured);
    bindCapabilityFiles(prepared, bundle);
    expect(prepared.body.environment).toEqual({
      ...configured,
      files: [...configured.files, ...bundle.files.map((file) => ({ type: 'inline', ...file }))],
      capability_directories: ['/workspace/tools/skills', ...bundle.directories],
    });
    expect(configured.files).toHaveLength(1);
    expect(actionSchema.parse(prepared)).toEqual(prepared);
  });
  it('preserves definitions without packaged files', () => {
    const prepared = action({ type: 'self_hosted', workspace_directory: '/workspace' });
    const original = structuredClone(prepared);
    bindCapabilityFiles(prepared, undefined);
    expect(prepared).toEqual(original);
  });
  it('rejects unsupported installation before provider dispatch instead of silently dropping skills', () => {
    for (const environment of [
      { type: 'none' },
      { type: 'self_hosted', workspace_directory: '/workspace' },
    ])
      expect(() => {
        bindCapabilityFiles(action(environment), bundle);
      }).toThrow('hosted input-file');
  });
  it('requires explicit template array overrides rather than dropping inherited files or skills', () => {
    for (const override of [{}, { files: [] }, { capability_directories: [] }])
      expect(() => {
        bindCapabilityFiles(
          action({ type: 'openai_hosted', environment_template_id: 'template', ...override }),
          bundle
        );
      }).toThrow('explicit complete');
    const prepared = action({
      type: 'openai_hosted',
      environment_template_id: 'template',
      files: [],
      capability_directories: [],
    });
    bindCapabilityFiles(prepared, bundle);
    expect(prepared.body.environment).toMatchObject({ capability_directories: bundle.directories });
  });
  it.each([
    '/relative/../bad',
    'relative',
    '/workspace/./skills',
    '/workspace//skills',
    '/workspace/skills/',
    '/workspace\\skills',
    '/workspace/\nsecret',
  ])('rejects unsafe discovery path %j', (path) => {
    expect(() => action({ type: 'openai_hosted', capability_directories: [path] })).toThrow();
  });
  it('rejects duplicate/excessive discovery and missing skill directories', () => {
    expect(() =>
      action({ type: 'openai_hosted', capability_directories: ['/workspace/a', '/workspace/a'] })
    ).toThrow();
    expect(() =>
      action({
        type: 'openai_hosted',
        capability_directories: Array.from(
          { length: 33 },
          (_, index) => `/workspace/dir${String(index)}`
        ),
      })
    ).toThrow();
    expect(() => {
      bindCapabilityFiles(action(), { ...bundle, directories: ['/workspace/missing'] });
    }).toThrow('no packaged skill');
  });
  it('rejects collisions, malformed bytes and output locations', () => {
    expect(() => {
      bindCapabilityFiles(action(), { ...bundle, files: [...bundle.files, ...bundle.files] });
    }).toThrow('collision');
    expect(() => {
      bindCapabilityFiles(
        action({ type: 'openai_hosted', files: [{ type: 'inline', path: root, data: 'e30=' }] }),
        bundle
      );
    }).toThrow('directory path collision');
    expect(() => {
      bindCapabilityFiles(action(), { ...bundle, files: [{ path: '/workspace/file', data: '?' }] });
    }).toThrow();
    expect(() => {
      bindCapabilityFiles(action(), {
        ...bundle,
        files: [{ path: '/workspace/outputs/secret', data: 'e30=' }],
      });
    }).toThrow('output artifact');
  });
  it('checks actual provider file count and per-file byte capacity', () => {
    expect(() => {
      bindCapabilityFiles(
        action({
          type: 'openai_hosted',
          files: Array.from({ length: 50 }, (_, index) => ({
            type: 'inline',
            path: `/workspace/file${String(index)}`,
            data: 'e30=',
          })),
        }),
        bundle
      );
    }).toThrow('capacity');
    expect(() => {
      bindCapabilityFiles(action(), {
        ...bundle,
        files: [
          {
            path: `${root}/skills/example/SKILL.md`,
            data: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'),
          },
        ],
      });
    }).toThrow('capacity');
  });
});
