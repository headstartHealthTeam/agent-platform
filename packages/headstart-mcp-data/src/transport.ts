import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

type SdkHttpTransport = Pick<Transport, 'start' | 'send' | 'close'> & {
  [Key in 'sessionId' | 'onmessage' | 'onerror' | 'onclose' | 'setProtocolVersion']?:
    Transport[Key] | undefined;
};

/** SDK 1.30's HTTP getters include undefined but Transport's optional fields do not.
 * Delegate without a cast: HTTP still owns its session/header lifecycle, including close.
 */
export function compatibleHttpTransport(http: SdkHttpTransport): Transport {
  const syncSession = (): void => {
    if (http.sessionId === undefined) delete transport.sessionId;
    else transport.sessionId = http.sessionId;
  };
  const transport: Transport = {
    start: () => http.start(),
    close: () => http.close(),
    send: async (message, options) => {
      await http.send(message, options);
      syncSession();
    },
    setProtocolVersion: (version) => {
      http.setProtocolVersion?.(version);
    },
  };
  http.onmessage = (message, extra): void => {
    syncSession();
    transport.onmessage?.(message, extra);
  };
  http.onerror = (error): void => {
    transport.onerror?.(error);
  };
  http.onclose = (): void => {
    transport.onclose?.();
  };
  return transport;
}
