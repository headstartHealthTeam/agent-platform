import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  connectSemrushStdio,
  parseSemrushCsv,
  parseSemrushTable,
  SemrushMcpProvider,
} from './mcp-provider.js';
import { semrushDomainRequestSchema } from './semrush.js';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  connect: vi.fn(),
  call: vi.fn(),
  close: vi.fn(),
  transportClose: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    public connect = mocks.connect;
    public callTool = mocks.call;
    public close = mocks.close;
  },
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    public close = mocks.transportClose;
  },
}));
function result(csv: string): unknown {
  return { content: [{ type: 'text', text: JSON.stringify(csv) }] };
}
const request = semrushDomainRequestSchema.parse({ domain: 'example.test', database: 'us' });
const overview = 'Database;Domain;Organic Keywords\r\nus;example.test;2\r\n';

describe('Semrush concrete MCP binding', () => {
  afterEach(() => vi.clearAllMocks());
  it('retains headers for a successful zero-ranking response and rejects malformed empty evidence', async () => {
    const header = 'Keyword;Position;Search Volume;Traffic (%);Url';
    expect(parseSemrushTable(result(header))).toEqual({ headers: header.split(';'), rows: [] });
    expect(parseSemrushCsv(result(header))).toEqual([]);
    const provider = new SemrushMcpProvider({
      callTool: async (): Promise<unknown> => result(header),
    });
    expect(await provider.domainOrganicKeywords(request)).toEqual([]);
    const malformed = new SemrushMcpProvider({
      callTool: async (): Promise<unknown> => result('Keyword;Traffic (%)'),
    });
    await expect(malformed.domainOrganicKeywords(request)).rejects.toThrow('required headers');
    expect(() => parseSemrushTable(result('Keyword;;Url'))).toThrow('Invalid Semrush headers');
  });
  it('parses CSV escapes and rejects malformed/error payloads', () => {
    expect(parseSemrushCsv(result('Keyword;Volume\n"a; b";10\n"a ""quote""";0'))).toEqual([
      { Keyword: 'a; b', Volume: '10' },
      { Keyword: 'a "quote"', Volume: '0' },
    ]);
    expect(
      parseSemrushCsv({ content: [{ type: 'text', text: 'A;B\n1;2\n' }, { type: 'image' }] })
    ).toEqual([{ A: '1', B: '2' }]);
    expect(() => parseSemrushCsv({ isError: true, content: [] })).toThrow(/error/);
    expect(() => parseSemrushCsv(result('ERROR 50'))).toThrow(/rejected/);
    expect(() => parseSemrushCsv(result('A;A\n1;2'))).toThrow(/headers/);
    expect(() => parseSemrushCsv(result('A;B\n1'))).toThrow(/column/);
    expect(() => parseSemrushCsv(result('A\n"unterminated'))).toThrow(/Unterminated/);
    expect(() => parseSemrushCsv(result(''))).toThrow(/headers/);
  });
  it('reads current and exact historical domain snapshots', async () => {
    const tools = {
      callTool: vi.fn(async (name: string) =>
        result(
          name === 'semrush_domain_rank_history' ? 'Date;Organic Keywords\n20260815;7\n' : overview
        )
      ),
    };
    const provider = new SemrushMcpProvider(tools);
    expect(await provider.domainOverview(request)).toEqual({
      domain: 'example.test',
      database: 'us',
      device: 'desktop',
      rankingKeywords: 2,
    });
    expect(await provider.domainOverview({ ...request, snapshotDate: '20260815' })).toMatchObject({
      rankingKeywords: 7,
      snapshotDate: '2026-08-15',
    });
    await expect(provider.domainOverview({ ...request, snapshotDate: '20250715' })).rejects.toThrow(
      /unavailable/
    );
    await expect(provider.domainOverview({ ...request, device: 'mobile' })).rejects.toThrow(
      /desktop/
    );
    await expect(
      new SemrushMcpProvider({
        callTool: async (): Promise<unknown> =>
          result(overview.replace('example.test', 'wrong.test')),
      }).domainOverview(request)
    ).rejects.toThrow(/different target/);
    await expect(
      new SemrushMcpProvider({
        callTool: async (): Promise<unknown> => result('Database;Domain\nus;example.test'),
      }).domainOverview(request)
    ).rejects.toThrow(/missing/);
  });
  it('normalizes rankings and refuses silent limit truncation or invented history', async () => {
    const provider = new SemrushMcpProvider({
      callTool: async (): Promise<unknown> =>
        result('Keyword;Position;Search Volume;Url\nexample;3;100;https://example.test/page\n'),
    });
    expect(await provider.domainOrganicKeywords(request)).toEqual([
      { keyword: 'example', position: 3, searchVolume: 100, url: 'https://example.test/page' },
    ]);
    await expect(provider.domainOrganicKeywords({ ...request, limit: 1 })).rejects.toThrow(
      /row limit/
    );
    await expect(
      provider.domainOrganicKeywords({ ...request, snapshotDate: '20260815' })
    ).rejects.toThrow(/current keyword/);
    expect(await provider.keywordOverview({ keywords: ['example'], database: 'us' })).toHaveLength(
      1
    );
  });
  it('starts only the fingerprinted installed provider and closes the connection', async () => {
    const bytes = Buffer.from('synthetic installed entrypoint');
    mocks.read.mockResolvedValue(bytes);
    mocks.call.mockResolvedValue(result(overview));
    const onRead = vi.fn();
    const input = {
      entrypoint: '/fixture/provider.js',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      env: {},
      onRead,
    };
    const connected = await connectSemrushStdio(input);
    await connected.provider.domainOverview(request);
    await connected.close();
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(onRead).toHaveBeenCalledWith({
      tool: 'semrush_domain_overview',
      arguments: { domain: 'example.test', database: 'us', limit: 10 },
      response: result(overview),
    });
    await expect(connectSemrushStdio({ ...input, entrypoint: 'relative.js' })).rejects.toThrow(
      /absolute/
    );
    await expect(connectSemrushStdio({ ...input, sha256: 'a'.repeat(64) })).rejects.toThrow(
      /fingerprint/
    );
    mocks.connect.mockRejectedValueOnce(new Error('connection failed'));
    await expect(connectSemrushStdio(input)).rejects.toThrow(/Unable to connect/);
    expect(mocks.transportClose).toHaveBeenCalledOnce();
  });
});
