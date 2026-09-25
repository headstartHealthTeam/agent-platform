import { isAbsolute } from 'node:path';

import { GoogleAuth } from 'google-auth-library';

import { GoogleReadError, type GoogleTokenProvider } from './transport.js';

/** An explicitly provisioned runtime credential, never an implicit desktop/ADC fallback. */
export class GoogleFileTokenProvider implements GoogleTokenProvider {
  readonly #auth: GoogleAuth;
  public constructor(credentialFile: string, scopes: string[]) {
    if (!isAbsolute(credentialFile) || scopes.length === 0) {
      throw new GoogleReadError(
        'An absolute credential file and explicit Google scopes are required'
      );
    }
    this.#auth = new GoogleAuth({ keyFile: credentialFile, scopes });
  }
  public async getAccessToken(): Promise<string> {
    try {
      const token = await this.#auth.getAccessToken();
      if (!token) throw new Error('empty token');
      return token;
    } catch {
      throw new GoogleReadError('Configured Google credential could not supply an access token');
    }
  }
}
