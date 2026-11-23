import type {} from 'devtools-protocol/types/protocol-mapping.js';

/** Browserless's documented CDP extension. Raw responses still require runtime validation. */
declare module 'devtools-protocol/types/protocol-mapping.js' {
  namespace ProtocolMapping {
    interface Commands {
      'Browserless.uploadFile': {
        paramsType: [
          { selector: string; files: { name: string; content: string; mimeType: string }[] },
        ];
        returnType: unknown;
      };
      'Browserless.liveURL': {
        paramsType: [
          {
            timeout: number;
            interactable: boolean;
            resizable: true;
            showBrowserInterface: true;
            quality: number;
            type: 'jpeg';
          },
        ];
        returnType: unknown;
      };
      'Browserless.closeLiveURL': {
        paramsType: [{ liveURLId: string }];
        returnType: unknown;
      };
    }
  }
}
