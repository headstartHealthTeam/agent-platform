import { parentPort, workerData } from 'node:worker_threads';

import { artifactValidationReply } from './artifact-validation.js';

if (!parentPort) throw new Error('Artifact validation requires a worker message channel.');
parentPort.postMessage(artifactValidationReply(workerData));
parentPort.close();
