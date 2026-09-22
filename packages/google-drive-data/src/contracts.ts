import { z } from 'zod';

export class GoogleDriveReadError extends Error {}
export const driveIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
export const driveFileSchema = z.object({
  id: driveIdSchema,
  name: z.string().min(1),
  mimeType: z.string().min(1),
  version: z.string().min(1),
  modifiedTime: z.string().optional(),
  md5Checksum: z.string().optional(),
  size: z.string().optional(),
  parents: z.array(z.string()).optional(),
  driveId: z.string().optional(),
  resourceKey: z.string().optional(),
  trashed: z.boolean().default(false),
  capabilities: z
    .object({ canDownload: z.boolean().default(false) })
    .default({ canDownload: false }),
  shortcutDetails: z
    .object({
      targetId: z.string(),
      targetMimeType: z.string(),
      targetResourceKey: z.string().optional(),
    })
    .optional(),
});
export type DriveFile = z.infer<typeof driveFileSchema>;
export const driveListRequestSchema = z
  .object({
    query: z.string().optional(),
    pageToken: z.string().optional(),
    driveId: driveIdSchema.optional(),
  })
  .strict();
export type DriveListRequest = z.infer<typeof driveListRequestSchema>;
export interface DriveListResult {
  files: DriveFile[];
  nextPageToken: string | null;
  incompleteSearch: boolean;
}
export const driveReadRequestSchema = z
  .object({
    fileId: driveIdSchema,
    version: z.string().min(1),
    resourceKey: driveIdSchema.optional(),
    exportMimeType: z.string().min(1).optional(),
    mode: z.enum(['text', 'page', 'original']),
    page: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .strict();
export type DriveReadRequest = z.infer<typeof driveReadRequestSchema>;
export const fileFields =
  'id,name,mimeType,version,modifiedTime,md5Checksum,size,parents,driveId,resourceKey,trashed,capabilities(canDownload),shortcutDetails(targetId,targetMimeType,targetResourceKey)';
export function resourceKeyHeader(fileId: string, key?: string): string | undefined {
  return key === undefined
    ? undefined
    : `${driveIdSchema.parse(fileId)}/${driveIdSchema.parse(key)}`;
}
