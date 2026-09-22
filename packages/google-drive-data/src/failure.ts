import { DocumentReadBusyError, DocumentReadError } from '@headstart-health/document-reading';
import { GoogleReadError } from '@headstart-health/google-read-transport';
import { ZodError } from 'zod';

import { GoogleDriveReadError } from './contracts.js';

export interface DriveRuntimeFailure {
  code: string;
  message: string;
}
/** Only our fixed provider/parser diagnostics cross the CLI boundary, never raw upstream bodies. */
export function driveRuntimeFailure(error: unknown): DriveRuntimeFailure {
  if (error instanceof DocumentReadBusyError)
    return { code: 'document-parser-busy', message: error.message };
  if (error instanceof GoogleDriveReadError)
    return { code: 'drive-source-read-failed', message: error.message };
  if (error instanceof GoogleReadError)
    return { code: 'google-transport-failed', message: error.message };
  if (error instanceof DocumentReadError)
    return { code: 'document-view-unavailable', message: error.message };
  if (error instanceof ZodError)
    return {
      code: 'invalid-request-or-source-shape',
      message:
        'Check the documented request/profile and source response shape; no evidence accepted.',
    };
  return {
    code: 'drive-runtime-failed',
    message:
      'Check required CLI arguments, readable profile/request files, a new output directory, explicit runtime identity and source format. No substitute evidence was produced.',
  };
}
