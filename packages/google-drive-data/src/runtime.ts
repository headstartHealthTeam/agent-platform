import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import {
  GcloudReadTokenProvider,
  GoogleFileTokenProvider,
  GoogleReadTransport,
} from '@headstart-health/google-read-transport';
import { z } from 'zod';

import {
  driveIdSchema,
  driveListRequestSchema,
  driveReadRequestSchema,
  type DriveFile,
  type DriveListResult,
} from './contracts.js';
import { GoogleDriveRestProvider } from './provider.js';
import { GoogleDriveReader, type DriveReadResult } from './reader.js';

export const driveRuntimeProfileSchema = z
  .object({
    expectedIdentity: z.email(),
    authentication: z.discriminatedUnion('kind', [
      z
        .object({ kind: z.literal('credential-file'), path: z.string().refine(isAbsolute) })
        .strict(),
      z.object({ kind: z.literal('operator-adc') }).strict(),
    ]),
  })
  .strict();
export type DriveRuntimeProfile = z.infer<typeof driveRuntimeProfileSchema>;
export const driveRuntimeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), input: driveListRequestSchema }).strict(),
  z
    .object({
      action: z.literal('metadata'),
      fileId: driveIdSchema,
      resourceKey: driveIdSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal('read'), input: driveReadRequestSchema }).strict(),
]);
export type DriveRuntimeRequest = z.infer<typeof driveRuntimeRequestSchema>;
export function createDriveRuntime(profile: DriveRuntimeProfile): GoogleDriveReader {
  const parsed = driveRuntimeProfileSchema.parse(profile);
  const tokens =
    parsed.authentication.kind === 'credential-file'
      ? new GoogleFileTokenProvider(parsed.authentication.path, [
          'https://www.googleapis.com/auth/drive.readonly',
        ])
      : new GcloudReadTokenProvider();
  return new GoogleDriveReader(new GoogleDriveRestProvider(new GoogleReadTransport(tokens)));
}
export type DriveRuntimeResult =
  | { kind: 'read'; data: DriveReadResult }
  | { kind: 'metadata'; data: DriveFile }
  | { kind: 'list'; data: DriveListResult };
export async function executeDriveRequest(
  reader: GoogleDriveReader,
  profile: DriveRuntimeProfile,
  request: DriveRuntimeRequest
): Promise<DriveRuntimeResult> {
  await reader.verifyIdentity(profile.expectedIdentity);
  switch (request.action) {
    case 'list':
      return { kind: 'list', data: await reader.list(request.input) };
    case 'metadata':
      return { kind: 'metadata', data: await reader.metadata(request.fileId, request.resourceKey) };
    case 'read':
      return { kind: 'read', data: await reader.read(request.input) };
  }
}
/** Keep complete bytes accessible as files, not a base64-only console message. */
export async function materializeDriveRead(
  result: DriveReadResult,
  directory: string
): Promise<unknown> {
  const artifacts: { path: string; mimeType: string; kind: string }[] = [];
  for (const [index, content] of result.content.entries()) {
    const mimeType = content.type === 'image' ? content.mimeType : content.resource.mimeType;
    const extensions: Readonly<Record<string, string>> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'application/json': '.json',
      'text/plain': '.txt',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    };
    const extension = new Map(Object.entries(extensions)).get(mimeType) ?? '.bin';
    const path = join(directory, `evidence-${String(index)}${extension}`);
    await writeFile(
      path,
      Buffer.from(content.type === 'image' ? content.data : content.resource.blob, 'base64'),
      { flag: 'wx', mode: 0o600 }
    );
    artifacts.push({ path, mimeType, kind: content.type });
  }
  return { document: result.document, source: result.source, artifacts };
}
export async function runDriveCli(input: {
  profile: string;
  request: string;
  output: string;
}): Promise<string> {
  if (![input.profile, input.request, input.output].every(isAbsolute))
    throw new Error('Use absolute profile, request and output paths');
  const profile = driveRuntimeProfileSchema.parse(
    JSON.parse(await readFile(input.profile, 'utf8'))
  );
  const request = driveRuntimeRequestSchema.parse(
    JSON.parse(await readFile(input.request, 'utf8'))
  );
  const reader = createDriveRuntime(profile);
  // A fresh output directory protects earlier evidence from accidental overwrite.
  await mkdir(input.output, { mode: 0o700 });
  const result = await executeDriveRequest(reader, profile, request);
  const output =
    result.kind === 'read' ? await materializeDriveRead(result.data, input.output) : result.data;
  const path = join(input.output, 'result.json');
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return path;
}
