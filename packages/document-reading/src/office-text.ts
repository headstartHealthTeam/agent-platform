import { Worker } from 'node:worker_threads';

import { DocumentReadBusyError, DocumentReadError } from './document-read-error.js';
import type { OfficeTextPage, OfficeTextRequest, OfficeTextResponse } from './office-types.js';

const FAILURE =
  'Office text extraction failed. Original mode remains available; this is not missing evidence.';
const DEADLINE_MS = 30_000;
let active = false;

function extractionError(result: Extract<OfficeTextResponse, { ok: false }>): DocumentReadError {
  if (result.reason === 'offset')
    return new DocumentReadError('Text offset is past the end of the document.');
  return new DocumentReadError(
    result.reason === 'capacity'
      ? `${FAILURE} The archive exceeds the 128 MiB expanded-content parsing budget.`
      : FAILURE
  );
}

function startOfficeWorker(): Worker {
  const source = import.meta.url.endsWith('.ts');
  const workerUrl = new URL(source ? './office-worker.ts' : './office-worker.js', import.meta.url);
  const options = {
    env: {},
    execArgv: [],
    stdout: true,
    stderr: true,
    resourceLimits: {
      maxOldGenerationSizeMb: 256,
      maxYoungGenerationSizeMb: 32,
      stackSizeMb: 4,
    },
  };
  if (!source) return new Worker(workerUrl, options);
  // Source-checkout authoring supports every Node 22 release. Deployed dist uses native JS above.
  // Resolve only our fixed development loader, never inherit caller NODE_OPTIONS or credentials.
  const loader = import.meta.resolve('tsx/esm/api');
  return new Worker(
    `void import(${JSON.stringify(loader)}).then(({tsImport}) => tsImport(${JSON.stringify(workerUrl.href)}, ${JSON.stringify(import.meta.url)}));`,
    { ...options, eval: true }
  );
}

async function extractInWorker(request: OfficeTextRequest): Promise<OfficeTextPage> {
  let worker: Worker;
  try {
    worker = startOfficeWorker();
  } catch {
    throw new DocumentReadError(FAILURE);
  }
  // Third-party parser diagnostics must not leak source content into caller logs.
  worker.stdout.resume();
  worker.stderr.resume();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await new Promise<OfficeTextResponse>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new DocumentReadError(`${FAILURE} Parsing exceeded its 30-second deadline.`));
      }, DEADLINE_MS);
      worker.once('message', (response: OfficeTextResponse) => {
        resolve(response);
      });
      worker.once('error', () => {
        reject(new DocumentReadError(FAILURE));
      });
      worker.once('exit', () => {
        reject(new DocumentReadError(FAILURE));
      });
      try {
        worker.postMessage(request);
      } catch {
        reject(new DocumentReadError(FAILURE));
      }
    });
    if (!result.ok) throw extractionError(result);
    return result.page;
  } finally {
    clearTimeout(timer);
    await worker.terminate().catch(() => {
      throw new DocumentReadError(FAILURE);
    });
  }
}

/** One parser per process, with no queue retaining source bytes. Originals bypass this path. */
export async function readOfficeText(request: OfficeTextRequest): Promise<OfficeTextPage> {
  if (active)
    throw new DocumentReadBusyError(
      'Office text parser is busy. Retry after the active extraction finishes. Original mode remains available; this is not an invalid file or missing evidence.'
    );
  active = true;
  try {
    return await extractInWorker(request);
  } finally {
    active = false;
  }
}
