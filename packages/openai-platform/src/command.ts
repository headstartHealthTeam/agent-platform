import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { resolveConfig } from './config.js';
import { readCredential } from './credential.js';
import { OpenAIPlatform, planAction, summarize } from './platform.js';
import { bundleSkills, gitReader, inspectWorkflow } from './source.js';

export const HELP =
  'headstart-openai preflight|read|plan|apply [--config PRIVATE.json] [--request ACTION.json] [--approve DIGEST --allow-billable] [--include-content]\n--config overrides HEADSTART_OPENAI_CONFIG; one private config path is required. Neither contains a key.\nheadstart-openai workflow WORKFLOW_DIRECTORY\nheadstart-openai bundle-skill REPOSITORY COMMIT SKILL --output PRIVATE_BUNDLE.json';
function jsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Unable to read JSON input; no file contents emitted.');
  }
}
export async function runCommand(args: string[]): Promise<unknown> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      request: { type: 'string' },
      approve: { type: 'string' },
      output: { type: 'string' },
      'allow-billable': { type: 'boolean' },
      'include-content': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  const [command, directory, revision, skill] = positionals;
  if (values.help || command === undefined) {
    return { help: HELP };
  }
  if (command === 'workflow' && directory !== undefined && positionals.length === 2) {
    return inspectWorkflow(directory);
  }
  if (
    command === 'bundle-skill' &&
    directory !== undefined &&
    revision !== undefined &&
    skill !== undefined &&
    positionals.length === 4 &&
    values.output !== undefined
  ) {
    const bundle = bundleSkills(gitReader(directory), revision, [skill]);
    writeFileSync(values.output, JSON.stringify(bundle, null, 2), { flag: 'wx', mode: 0o600 });
    return {
      revision: bundle.revision,
      digest: bundle.digest,
      skills: bundle.skills.map((entry) => entry.name),
      files: bundle.files,
      output: values.output,
    };
  }
  const configPath = values.config ?? process.env['HEADSTART_OPENAI_CONFIG'];
  if (
    !['preflight', 'read', 'plan', 'apply'].includes(command) ||
    positionals.length !== 1 ||
    configPath === undefined ||
    configPath.trim().length === 0
  ) {
    throw new Error(HELP);
  }
  const config = resolveConfig(jsonFile(configPath));
  const request = values.request === undefined ? undefined : jsonFile(values.request);
  if (command === 'plan') {
    return planAction(config.target, request);
  }
  if (command === 'apply' && values.approve === undefined) {
    throw new Error('Run plan and obtain approval for its digest before applying.');
  }
  const platform = new OpenAIPlatform(config, await readCredential(config.credential));
  if (command === 'preflight') {
    return platform.preflight();
  }
  const result =
    command === 'read'
      ? await platform.read(request)
      : await platform.apply(request, {
          apply: true,
          digest: values.approve ?? '',
          allowBillable: values['allow-billable'] === true,
        });
  return {
    data: values['include-content'] === true ? result.data : summarize(result.data),
    fingerprint: result.fingerprint,
  };
}
