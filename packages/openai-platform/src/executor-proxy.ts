import { createServer, type Server } from 'node:http';
import { connect, Socket } from 'node:net';

const destinations = new Map([
  ['api.openai.com:443', 'api.openai.com'],
  ['codex-cloud-environments.chatgpt.com:443', 'codex-cloud-environments.chatgpt.com'],
]);

/** Dedicated egress proxy: TLS tunnels to the two executor hosts, no raw request logging. */
export function createExecutorProxy(): Server {
  const server = createServer((_request, response) => {
    response.writeHead(403);
    response.end();
  });
  server.on('connect', (request, client, head) => {
    const host = destinations.get(request.url ?? '');
    if (!host) {
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = connect({ host, port: 443 });
    const close = (): void => {
      upstream.destroy();
      client.destroy();
    };
    upstream.on('error', close);
    client.on('error', close);
    upstream.setTimeout(360_000, close);
    if (client instanceof Socket) client.setTimeout(360_000, close);
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  return server;
}
