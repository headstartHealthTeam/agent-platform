import type { GoogleResponseReader } from '@headstart-health/google-read-transport';

export interface GoogleDriveReadPort {
  get(
    path: string,
    query: Readonly<Record<string, string>>,
    resourceKey?: string
  ): Promise<Response>;
}

/** Only provider-specific paths live here; authentication and HTTP policy are shared. */
export class GoogleDriveRestProvider implements GoogleDriveReadPort {
  public constructor(private readonly transport: GoogleResponseReader) {}
  public async get(
    path: string,
    query: Readonly<Record<string, string>>,
    resourceKey?: string
  ): Promise<Response> {
    const documents = /^documents\/[A-Za-z0-9_-]+$/.test(path);
    if (
      !documents &&
      !/^(?:about|files|files\/[A-Za-z0-9_-]+|files\/[A-Za-z0-9_-]+\/export)$/.test(path)
    ) {
      throw new Error('Unsupported Drive read operation');
    }
    const url = new URL(
      path,
      documents ? 'https://docs.googleapis.com/v1/' : 'https://www.googleapis.com/drive/v3/'
    );
    url.search = new URLSearchParams(query).toString();
    return this.transport.readResponse(url.toString(), resourceKey);
  }
}
