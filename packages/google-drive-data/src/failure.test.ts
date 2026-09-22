import { DocumentReadError } from '@headstart-health/document-reading';
import { GoogleReadError } from '@headstart-health/google-read-transport';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { GoogleDriveReadError } from './contracts.js';
import { driveRuntimeFailure } from './failure.js';

describe('actionable, sanitized runtime failures', () => {
  it('retains source version, identity, transport and format diagnostics', () => {
    for (const error of [
      new GoogleDriveReadError('google-drive-version-changed'),
      new GoogleReadError('Google read returned HTTP 403'),
      new DocumentReadError('Use original mode'),
    ]) {
      expect(driveRuntimeFailure(error).message).toBe(error.message);
    }
  });
  it('withholds arbitrary errors and source values', () => {
    expect(driveRuntimeFailure(new Error('private credential detail')).message).not.toContain(
      'private credential detail'
    );
    const parsed = z.literal('expected').safeParse('private source value');
    if (parsed.success) throw new Error('Expected validation failure');
    expect(driveRuntimeFailure(parsed.error).code).toBe('invalid-request-or-source-shape');
    expect(driveRuntimeFailure(parsed.error).message).not.toContain('private source value');
  });
});
