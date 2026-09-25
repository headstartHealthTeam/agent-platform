import { parentPort } from 'node:worker_threads';

import { parseOfficeText } from './office-parser.js';
import type { OfficeTextRequest } from './office-types.js';

if (parentPort === null) throw new Error('Office parser requires an isolated worker.');
const port = parentPort;
port.once('message', (request: OfficeTextRequest) => {
  parseOfficeText(request)
    .then((response) => {
      port.postMessage(response);
      port.close();
      return undefined;
    })
    .catch(() => {
      port.close();
    });
});
