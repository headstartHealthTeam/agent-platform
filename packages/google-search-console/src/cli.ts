#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import {
  FetchSearchConsoleTransport,
  GcloudAppDefaultTokenProvider,
  SearchConsoleClient,
  SearchConsoleError,
  addSnapshotMetadata,
  buildSearchAnalyticsRequest,
  resolveSiteUrl,
  runPaginatedSearch,
} from './search-console.js';

const options = {
  'site-url': { type: 'string' },
  'start-date': { type: 'string' },
  'end-date': { type: 'string' },
  dimensions: { type: 'string', default: '' },
  'search-type': { type: 'string', default: 'web' },
  'data-state': { type: 'string', default: 'final' },
  'row-limit': { type: 'string', default: '25000' },
  'start-row': { type: 'string', default: '0' },
  'aggregation-type': { type: 'string', default: 'auto' },
  'filters-json': { type: 'string' },
  'all-pages': { type: 'boolean', default: false },
  'max-rows': { type: 'string', default: '100000' },
  output: { type: 'string' },
} as const;

async function parseFilters(value: string | undefined): Promise<unknown[]> {
  if (value === undefined || value.length === 0) {
    return [];
  }
  const raw = value.startsWith('@') ? await readFile(resolve(value.slice(1)), 'utf8') : value;
  const parsed: unknown = JSON.parse(raw);
  return z.array(z.unknown()).parse(parsed);
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) {
    throw new SearchConsoleError(`${flag} is required`);
  }
  return value;
}

function integer(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new SearchConsoleError(`${flag} must be an integer`);
  }
  return parsed;
}

async function writeJsonImmutable(path: string, value: unknown): Promise<void> {
  const absolute = resolve(path);
  const directory = dirname(absolute);
  await mkdir(directory, { recursive: true });
  const temporary = `${absolute}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, undefined, 2)}\n`, { flag: 'wx' });
  try {
    await link(temporary, absolute);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function execute(): Promise<void> {
  const parsed = parseArgs({ args: process.argv.slice(2), options, allowPositionals: true });
  const command = parsed.positionals[0];
  if (!['sites', 'sitemaps', 'search-analytics'].includes(command ?? '')) {
    throw new SearchConsoleError('command must be sites, sitemaps, or search-analytics');
  }

  const client = new SearchConsoleClient(
    new FetchSearchConsoleTransport(new GcloudAppDefaultTokenProvider())
  );
  let result: Readonly<Record<string, unknown>>;
  if (command === 'sites') {
    result = await client.listSites();
  } else if (command === 'sitemaps') {
    const siteUrl = await resolveSiteUrl(client, parsed.values['site-url']);
    result = { ...(await client.listSitemaps(siteUrl)), siteUrl };
  } else {
    const filters = await parseFilters(parsed.values['filters-json']);
    const request = buildSearchAnalyticsRequest({
      startDate: required(parsed.values['start-date'], '--start-date'),
      endDate: required(parsed.values['end-date'], '--end-date'),
      type: parsed.values['search-type'],
      dataState: parsed.values['data-state'],
      rowLimit: integer(parsed.values['row-limit'], '--row-limit'),
      startRow: integer(parsed.values['start-row'], '--start-row'),
      aggregationType: parsed.values['aggregation-type'],
      dimensions: parsed.values.dimensions
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
      dimensionFilterGroups: filters.length === 0 ? [] : [{ groupType: 'and', filters }],
    });
    const siteUrl = await resolveSiteUrl(client, parsed.values['site-url']);
    result = await runPaginatedSearch(client, siteUrl, request, {
      allPages: parsed.values['all-pages'],
      maxRows: integer(parsed.values['max-rows'], '--max-rows'),
    });
  }

  const snapshot = addSnapshotMetadata(result);
  const output = parsed.values.output;
  if (output === undefined) {
    process.stdout.write(`${JSON.stringify(snapshot, undefined, 2)}\n`);
  } else {
    await writeJsonImmutable(output, snapshot);
    process.stdout.write(`${resolve(output)}\n`);
  }
}

execute().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
