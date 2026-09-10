import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';

import {
  semrushDomainOverviewSchema,
  semrushRankingSchema,
  type SemrushDomainRequest,
  type SemrushReadProvider,
} from './semrush.js';

export interface SemrushToolReader {
  callTool(name: string, arguments_: Readonly<Record<string, unknown>>): Promise<unknown>;
}
const READ_TOOLS = new Set([
  'semrush_domain_overview',
  'semrush_domain_organic_keywords',
  'semrush_domain_rank_history',
  'semrush_keyword_overview',
]);
export class SemrushProviderError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SemrushProviderError';
  }
}

export function parseSemrushCsv(input: unknown): readonly Readonly<Record<string, string>>[] {
  const result = z
    .object({
      isError: z.boolean().optional(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
    })
    .parse(input);
  if (result.isError) throw new SemrushProviderError('Semrush MCP returned an error');
  const text = result.content
    .filter((x) => x.type === 'text')
    .map((x) => x.text ?? '')
    .join('\n');
  let csv = text;
  if (text.startsWith('"')) {
    const decoded: unknown = JSON.parse(text);
    csv = z.string().parse(decoded);
  }
  if (/^(ERROR|Error:)/.test(csv.trim()))
    throw new SemrushProviderError('Semrush API rejected the read');
  const records = csvRows(csv);
  const headers = records.shift();
  if (headers?.length !== new Set(headers).size)
    throw new SemrushProviderError('Invalid Semrush headers');
  return records
    .filter((x) => x.some(Boolean))
    .map((values) => {
      if (values.length !== headers.length)
        throw new SemrushProviderError('Semrush CSV column count mismatch');
      return Object.fromEntries(headers.map((key, index) => [key, values.at(index) ?? '']));
    });
}
function csvRows(csv: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv.charAt(index);
    if (char === '"') {
      if (quoted && csv.charAt(index + 1) === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ';' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' && !quoted) {
      row.push(cell.replace(/\r$/, ''));
      records.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) throw new SemrushProviderError('Unterminated quoted Semrush CSV');
  if (cell || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    records.push(row);
  }
  return records;
}
function value(row: Readonly<Record<string, string>>, key: string): string {
  const result = Object.entries(row).find(([name]) => name === key)?.[1];
  if (result === undefined || result === '')
    throw new SemrushProviderError(`Semrush column ${key} is missing`);
  return result;
}
export class SemrushMcpProvider implements SemrushReadProvider {
  readonly #tools: SemrushToolReader;
  public constructor(tools: SemrushToolReader) {
    this.#tools = tools;
  }
  public async domainOverview(request: SemrushDomainRequest): Promise<unknown> {
    this.#desktop(request);
    if (request.snapshotDate !== undefined) {
      const rows = parseSemrushCsv(
        await this.#tools.callTool('semrush_domain_rank_history', {
          domain: request.domain,
          database: request.database,
          limit: 1000,
        })
      );
      const row = rows.find((x) => value(x, 'Date') === request.snapshotDate);
      if (row === undefined)
        throw new SemrushProviderError('Requested historical Semrush snapshot is unavailable');
      const date = request.snapshotDate;
      return semrushDomainOverviewSchema.parse({
        domain: request.domain,
        database: request.database,
        device: request.device,
        rankingKeywords: value(row, 'Organic Keywords'),
        snapshotDate: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      });
    }
    const rows = parseSemrushCsv(
      await this.#tools.callTool('semrush_domain_overview', {
        domain: request.domain,
        database: request.database,
        limit: 10,
      })
    );
    const row = rows.find(
      (x) => value(x, 'Domain') === request.domain && value(x, 'Database') === request.database
    );
    if (row === undefined)
      throw new SemrushProviderError('Semrush overview returned a different target');
    return semrushDomainOverviewSchema.parse({
      domain: value(row, 'Domain'),
      database: value(row, 'Database'),
      device: request.device,
      rankingKeywords: value(row, 'Organic Keywords'),
    });
  }
  public async domainOrganicKeywords(request: SemrushDomainRequest): Promise<unknown> {
    this.#desktop(request);
    if (request.snapshotDate !== undefined)
      throw new SemrushProviderError(
        'This MCP binding supports current keyword rankings only; historical domain totals are separate'
      );
    const rows = parseSemrushCsv(
      await this.#tools.callTool('semrush_domain_organic_keywords', {
        domain: request.domain,
        database: request.database,
        limit: request.limit,
      })
    );
    if (rows.length >= request.limit)
      throw new SemrushProviderError('Semrush rankings reached the configured row limit');
    return rows.map((row) =>
      semrushRankingSchema.parse({
        keyword: value(row, 'Keyword'),
        position: value(row, 'Position'),
        searchVolume: value(row, 'Search Volume'),
        url: value(row, 'Url'),
      })
    );
  }
  public async keywordOverview(input: {
    readonly keywords: readonly string[];
    readonly database: string;
  }): Promise<unknown> {
    return Promise.all(
      input.keywords.map(async (keyword) => ({
        keyword,
        rows: parseSemrushCsv(
          await this.#tools.callTool('semrush_keyword_overview', {
            keyword,
            database: input.database,
            limit: 10,
          })
        ),
      }))
    );
  }
  #desktop(request: SemrushDomainRequest): void {
    if (request.device !== 'desktop')
      throw new SemrushProviderError('This Semrush MCP binding supports desktop only');
  }
}

export async function connectSemrushStdio(input: {
  readonly entrypoint: string;
  readonly sha256: string;
  readonly env: Readonly<Record<string, string>>;
  readonly onRead?: (evidence: {
    readonly tool: string;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly response: unknown;
  }) => Promise<void>;
}): Promise<{ readonly provider: SemrushMcpProvider; close(): Promise<void> }> {
  if (!isAbsolute(input.entrypoint) || !/^[a-f0-9]{64}$/.test(input.sha256))
    throw new SemrushProviderError(
      'Semrush requires an absolute installed entrypoint and pinned SHA-256'
    );
  const digest = createHash('sha256')
    .update(await readFile(input.entrypoint))
    .digest('hex');
  if (digest !== input.sha256)
    throw new SemrushProviderError('Semrush entrypoint differs from its approved fingerprint');
  const client = new Client({ name: 'headstart-semrush-read', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [input.entrypoint],
    env: { ...input.env },
    stderr: 'ignore',
  });
  try {
    await client.connect(transport, { timeout: 60_000 });
  } catch {
    await transport.close();
    throw new SemrushProviderError('Unable to connect to the installed Semrush MCP');
  }
  return {
    provider: new SemrushMcpProvider({
      callTool: async (name, arguments_): Promise<unknown> => {
        if (!READ_TOOLS.has(name))
          throw new SemrushProviderError('Semrush tool is outside the read allowlist');
        const response = await client.callTool({ name, arguments: { ...arguments_ } }, undefined, {
          timeout: 60_000,
        });
        parseSemrushCsv(response);
        await input.onRead?.({ tool: name, arguments: arguments_, response });
        return response;
      },
    }),
    close: async (): Promise<void> => client.close(),
  };
}
