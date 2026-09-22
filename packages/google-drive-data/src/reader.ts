import { createHash } from 'node:crypto';

import { readDocument, type DocumentReadResult } from '@headstart-health/document-reading';
import { z } from 'zod';

import {
  driveFileSchema,
  driveIdSchema,
  driveListRequestSchema,
  driveReadRequestSchema,
  fileFields,
  GoogleDriveReadError,
  resourceKeyHeader,
  type DriveFile,
  type DriveListRequest,
  type DriveListResult,
  type DriveReadRequest,
} from './contracts.js';
import type { GoogleDriveReadPort } from './provider.js';

const DOC_MIME = 'application/vnd.google-apps.document';
const GOOGLE_EXPORT = 'google-export';
interface Download {
  bytes: Buffer;
  mimeType: string;
  representation: 'google-docs-structure' | 'google-export' | 'original';
}
export interface DriveReadResult extends DocumentReadResult {
  source: DriveFile & { representation: Download['representation']; exportMimeType?: string };
}
function readable(file: DriveFile): void {
  if (file.trashed || !file.capabilities.canDownload)
    throw new GoogleDriveReadError('google-drive-content-access-denied');
}
function documentRequest(input: DriveReadRequest): Parameters<typeof readDocument>[2] {
  return {
    mode: input.mode,
    ...(input.page === undefined ? {} : { page: input.page }),
    ...(input.offset === undefined ? {} : { offset: input.offset }),
  };
}
/** Discovery and complete evidence retrieval, without credentialing or application policy. */
export class GoogleDriveReader {
  public constructor(private readonly provider: GoogleDriveReadPort) {}
  public async verifyIdentity(expectedEmail: string): Promise<void> {
    const response: unknown = await (
      await this.provider.get('about', { fields: 'user(emailAddress)' })
    ).json();
    const identity = z.object({ user: z.object({ emailAddress: z.email() }) }).safeParse(response);
    if (
      !identity.success ||
      identity.data.user.emailAddress.toLowerCase() !== expectedEmail.toLowerCase()
    ) {
      throw new GoogleDriveReadError('google-drive-wrong-identity');
    }
  }
  public async list(input: DriveListRequest): Promise<DriveListResult> {
    const request = driveListRequestSchema.parse(input);
    const response: unknown = await (
      await this.provider.get('files', {
        q: request.query ? `trashed = false and (${request.query})` : 'trashed = false',
        pageSize: '100',
        fields: `nextPageToken,incompleteSearch,files(${fileFields})`,
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        corpora: request.driveId ? 'drive' : 'allDrives',
        ...(request.driveId ? { driveId: request.driveId } : {}),
        ...(request.pageToken ? { pageToken: request.pageToken } : {}),
      })
    ).json();
    const page = z
      .object({
        files: z.array(driveFileSchema),
        nextPageToken: z.string().optional(),
        incompleteSearch: z.boolean().default(false),
      })
      .parse(response);
    return { ...page, nextPageToken: page.nextPageToken ?? null };
  }
  public async metadata(fileId: string, resourceKey?: string): Promise<DriveFile> {
    const response: unknown = await (
      await this.provider.get(
        `files/${driveIdSchema.parse(fileId)}`,
        { fields: fileFields, supportsAllDrives: 'true' },
        resourceKeyHeader(fileId, resourceKey)
      )
    ).json();
    const file = driveFileSchema.parse(response);
    if (file.id !== fileId) throw new GoogleDriveReadError('google-drive-wrong-file');
    return file;
  }
  async #download(file: DriveFile, input: DriveReadRequest): Promise<Download> {
    if (
      file.shortcutDetails !== undefined ||
      file.mimeType === 'application/vnd.google-apps.folder'
    ) {
      throw new GoogleDriveReadError(
        'Read the shortcut target by its own ID/version, or list the folder contents.'
      );
    }
    const key = resourceKeyHeader(file.id, input.resourceKey ?? file.resourceKey);
    if (file.mimeType === DOC_MIME && input.mode === 'text' && input.exportMimeType === undefined) {
      const structure: unknown = await (
        await this.provider.get(
          `documents/${file.id}`,
          { includeTabsContent: 'true', suggestionsViewMode: 'SUGGESTIONS_INLINE' },
          key
        )
      ).json();
      const parsed = z
        .object({ documentId: z.literal(file.id), tabs: z.array(z.unknown()) })
        .loose()
        .safeParse(structure);
      if (!parsed.success)
        throw new GoogleDriveReadError('google-drive-invalid-document-structure');
      return {
        bytes: Buffer.from(JSON.stringify(structure)),
        mimeType: 'application/json',
        representation: 'google-docs-structure',
      };
    }
    const native = file.mimeType.startsWith('application/vnd.google-apps.');
    if (native && input.exportMimeType === undefined)
      throw new GoogleDriveReadError(
        'Choose exportMimeType explicitly; a Google export is not an original binary.'
      );
    if (!native && input.exportMimeType !== undefined)
      throw new GoogleDriveReadError('Do not export a binary file; read its original format.');
    const mimeType = input.exportMimeType ?? file.mimeType;
    const response = await this.provider.get(
      `files/${file.id}${native ? '/export' : ''}`,
      native ? { mimeType } : { alt: 'media', supportsAllDrives: 'true' },
      key
    );
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType,
      representation: native ? GOOGLE_EXPORT : 'original',
    };
  }
  public async read(input: DriveReadRequest): Promise<DriveReadResult> {
    const request = driveReadRequestSchema.parse(input);
    const file = await this.metadata(request.fileId, request.resourceKey);
    if (file.version !== request.version)
      throw new GoogleDriveReadError('google-drive-version-changed: reread metadata');
    readable(file);
    const download = await this.#download(file, request);
    const after = await this.metadata(file.id, request.resourceKey ?? file.resourceKey);
    if (after.version !== file.version || after.mimeType !== file.mimeType)
      throw new GoogleDriveReadError('google-drive-source-changed-during-read');
    readable(after);
    if (
      download.representation === 'original' &&
      file.md5Checksum !== undefined &&
      createHash('md5').update(download.bytes).digest('hex') !== file.md5Checksum
    ) {
      throw new GoogleDriveReadError('google-drive-content-checksum-mismatch');
    }
    const result = await readDocument(download.bytes, download.mimeType, documentRequest(request));
    if (download.representation === 'google-docs-structure')
      result.document.warnings.push(
        'Complete Google Docs JSON structure, including all tabs/child tabs and inline suggestions. Follow text cursors to completion. Use explicit PDF export for visual inspection; this is not an original binary.'
      );
    if (download.representation === GOOGLE_EXPORT)
      result.document.warnings.push(
        'Google-generated export, not original bytes. Verify required tabs/sheets and layout; export limits are not evidence of absence.'
      );
    return {
      ...result,
      source: {
        ...file,
        representation: download.representation,
        ...(download.representation === GOOGLE_EXPORT ? { exportMimeType: download.mimeType } : {}),
      },
    };
  }
}
