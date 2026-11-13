import { classifyPath, sha256Json } from './analysis.js';
import { compareCanonicalText } from './canonical-order.js';
import { buildLifecycle } from './lifecycle.js';
import { reportContextSchema, type ReportContext } from './report-context.js';
import type { PeriodId } from './schemas.js';
import type { ReportRows } from './workbook-contract.js';
import {
  gscView,
  landingPages,
  orderedPeriods,
  period,
  publicPages,
  ratio,
  type WorkbookEvidence,
  type SearchRow,
} from './workbook-evidence.js';
import { delta, required } from './workbook-metrics.js';

type Blocks = Map<string, ReportRows>;
type Landing = ReturnType<typeof landingPages>[number];
type Article = ReportContext['editorial']['articles'][number];

function eligibility(evidence: WorkbookEvidence, path: string, article?: Article): string {
  const id = classifyPath(
    path,
    evidence.bundle.config.routeRegistry,
    evidence.bundle.config.unmatchedSegment
  );
  const route = evidence.bundle.config.routeRegistry.find((row) => row.id === id);
  const publication = article?.publishedOn;
  const routeLaunch = route?.lifecycle?.launchedOn;
  const launchedOn =
    publication && (!routeLaunch || publication > routeLaunch) ? publication : routeLaunch;
  const rule = launchedOn
    ? {
        id: path,
        exactPaths: [path],
        prefixes: [],
        lifecycle: {
          launchedOn,
          evidenceUrl: required(
            article?.sourceUrl ?? route?.lifecycle?.evidenceUrl,
            'launch evidence'
          ),
          comparisonPolicy: 'complete-post-launch-months' as const,
        },
      }
    : (route ?? { id: path, exactPaths: [path], prefixes: [] });
  const lifecycle = required(buildLifecycle(evidence.bundle.report.periods, [rule])[0], path);
  return lifecycle.momEligible ? 'comparable' : lifecycle.state;
}

function comparisonRow(
  kind: string,
  key: string,
  current: SearchRow | undefined,
  previous: SearchRow | undefined,
  eligible: string
): ReportRows[number] {
  const complete = current !== undefined && previous !== undefined;
  const comparable = eligible === 'comparable' && complete;
  return [
    kind,
    key,
    current?.clicks ?? null,
    previous?.clicks ?? null,
    comparable ? delta(current.clicks, previous.clicks, 'absolute') : null,
    comparable ? delta(current.clicks, previous.clicks) : null,
    current?.impressions ?? null,
    previous?.impressions ?? null,
    comparable ? delta(current.impressions, previous.impressions, 'absolute') : null,
    comparable ? delta(current.impressions, previous.impressions) : null,
    current?.ctr ?? null,
    previous?.ctr ?? null,
    comparable ? delta(current.ctr, previous.ctr, 'rate') : null,
    current?.position ?? null,
    previous?.position ?? null,
    comparable ? delta(current.position, previous.position, 'absolute') : null,
    complete ? eligible : 'No returned row in one period; not inferred zero',
  ];
}

function comparisons(blocks: Blocks, evidence: WorkbookEvidence, context: ReportContext): void {
  const rows: ReportRows = [];
  for (const kind of ['Page', 'Query']) {
    const read = (id: PeriodId): SearchRow[] =>
      kind === 'Page' ? publicPages(evidence, id) : gscView(evidence, id, 'queries');
    const current = new Map(read('current').map((row) => [row.key, row]));
    const previous = new Map(read('previous').map((row) => [row.key, row]));
    const keys = [...new Set([...current.keys(), ...previous.keys()])].sort(compareCanonicalText);
    for (const key of keys) {
      const article = context.editorial.articles.find((row) => row.path === key);
      const status =
        kind === 'Page'
          ? eligibility(evidence, key, article)
          : period(evidence, 'previous')
            ? 'comparable'
            : 'missing_period';
      rows.push(comparisonRow(kind, key, current.get(key), previous.get(key), status));
    }
  }
  blocks.set('detail.search', rows);
  blocks.set('detail.searchBoundary', [
    [
      'Returned GSC rows only; protected/omitted queries are not zero. Full source extracts remain in Raw - GSC. Percentage changes with zero baselines are blank. CTR changes are percentage points. New-page comparisons respect complete-month eligibility.',
    ],
  ]);
}

function articles(blocks: Blocks, evidence: WorkbookEvidence, context: ReportContext): void {
  const pages = new Map(publicPages(evidence, 'current').map((row) => [row.key, row]));
  const previous = new Map(publicPages(evidence, 'previous').map((row) => [row.key, row]));
  const landings = new Map(landingPages(evidence, 'current').map((row) => [row.path, row]));
  const current = required(period(evidence, 'current'), 'current period');
  blocks.set(
    'detail.articles',
    context.editorial.articles
      .filter((article) => !article.publishedOn || article.publishedOn <= current.endDate)
      .map((article) => {
        const page = pages.get(article.path);
        const old = previous.get(article.path);
        const landing = landings.get(article.path);
        const status = eligibility(evidence, article.path, article);
        return [
          article.title,
          article.path,
          article.audience,
          context.editorial.pillars.find((row) => row.id === article.pillarId)?.label ?? 'Unmapped',
          article.publishedOn,
          page?.clicks ?? null,
          page?.impressions ?? null,
          old?.clicks ?? null,
          status === 'comparable' ? delta(page?.clicks ?? null, old?.clicks ?? null) : null,
          landing?.sessions ?? null,
          landing?.engagedSessions ?? null,
          landing?.engagementRate ?? null,
          landing?.keyEvents ?? null,
          status,
        ];
      })
  );
  blocks.set('detail.articleBoundary', [
    [
      `Catalog ${context.editorial.version}: ${context.editorial.mappingPolicy} Unmapped articles remain visible. Key events are diagnostic mixed events, not attributed canonical outcomes. Missing returned rows remain blank.`,
    ],
  ]);
  pillarRollup(blocks, evidence, context);
}

function pillarRollup(blocks: Blocks, evidence: WorkbookEvidence, context: ReportContext): void {
  const rollup: ReportRows = [];
  for (const window of evidence.bundle.report.periods) {
    const search = new Map(publicPages(evidence, window.id).map((row) => [row.key, row]));
    const ga = new Map(landingPages(evidence, window.id).map((row) => [row.path, row]));
    const groups = [
      ...context.editorial.pillars,
      ...['families', 'bcbas', 'rbts', 'shared_unassigned'].map((audience) => ({
        id: null,
        label: 'Unmapped',
        audience,
      })),
    ];
    for (const group of groups) {
      const members = context.editorial.articles.filter(
        (row) =>
          row.audience === group.audience &&
          row.pillarId === group.id &&
          (!row.publishedOn || row.publishedOn <= window.endDate)
      );
      rollup.push(pillarRow(group.audience, group.label, window.label, members, search, ga));
    }
  }
  blocks.set('detail.pillars', rollup);
}

function pillarRow(
  audience: string,
  label: string,
  periodLabel: string,
  members: Article[],
  search: Map<string, SearchRow>,
  ga: Map<string, Landing>
): ReportRows[number] {
  const searchRows = members.flatMap((row) => search.get(row.path) ?? []);
  const gaRows = members.flatMap((row) => ga.get(row.path) ?? []);
  const sessions = gaRows.reduce((sum, row) => sum + row.sessions, 0);
  const engaged = gaRows.reduce((sum, row) => sum + row.engagedSessions, 0);
  return [
    audience,
    label,
    periodLabel,
    members.length,
    searchRows.length ? searchRows.reduce((sum, row) => sum + row.clicks, 0) : null,
    searchRows.length ? searchRows.reduce((sum, row) => sum + row.impressions, 0) : null,
    gaRows.length ? sessions : null,
    gaRows.length ? engaged : null,
    gaRows.length ? ratio(engaged, sessions) : null,
    gaRows.length ? gaRows.reduce((sum, row) => sum + row.keyEvents, 0) : null,
    `${String(searchRows.length)}/${String(members.length)} GSC; ${String(gaRows.length)}/${String(members.length)} GA`,
  ];
}

function aiVisibility(blocks: Blocks, context: ReportContext): void {
  const ai = context.aiVisibility;
  blocks.set(
    'detail.ai',
    ai.status === 'unavailable'
      ? [[ai.provider, 'Unavailable', null, null, null, null, ai.checkedAt, ai.reason]]
      : ai.observations.map((row) => [
          row.provider,
          row.platform,
          row.metric,
          row.value,
          row.unit,
          `${row.window.startDate} to ${row.window.endDate}`,
          row.source.retrievedAt,
          `${row.definition} Coverage: ${row.coverage}. ${row.source.url}`,
        ])
  );
  blocks.set('detail.aiBoundary', [
    [
      'AI visibility describes observed mentions/citations within a stated provider sample. It is separate from conventional keyword rankings, AI referrals, visits and conversions. Each observation retains its own dates; no historical growth is inferred from a current snapshot.',
    ],
  ]);
}

function highlights(blocks: Blocks, evidence: WorkbookEvidence, context: ReportContext): void {
  const pages = new Map(publicPages(evidence, 'current').map((row) => [row.key, row]));
  const ga = new Map(landingPages(evidence, 'current').map((row) => [row.path, row]));
  blocks.set(
    'detail.highlights',
    context.highlightPaths.map((path) => {
      if (!pages.has(path) && !ga.has(path))
        throw new Error('Highlight has no retained page evidence');
      const page = pages.get(path);
      const landing = ga.get(path);
      return [
        path,
        page?.clicks ?? null,
        page?.impressions ?? null,
        page?.ctr ?? null,
        landing?.sessions ?? null,
        landing?.engagementRate ?? null,
      ];
    })
  );
  blocks.set(
    'detail.followUps',
    context.followUps.map((row) => [
      row.label,
      row.metric,
      row.value,
      row.unit,
      `${row.window.startDate} to ${row.window.endDate}`,
      row.source.retrievedAt,
      row.source.url,
      row.limitation,
    ])
  );
  blocks.set('detail.highlightBoundary', [
    [
      `Primary evidence: ${context.reportWindow.startDate} to ${context.reportWindow.endDate}. Any later observations below are separately dated follow-ups, not monthly scorecard results or matched-window growth.`,
    ],
  ]);
}

function outcomes(blocks: Blocks, evidence: WorkbookEvidence, context: ReportContext): void {
  blocks.set(
    'detail.outcomes',
    evidence.bundle.config.outcomeRegistry.flatMap((outcome) =>
      orderedPeriods.map((id) => {
        const row = evidence.bundle.sources.ga4.outcomeRows?.find(
          (item) => item.audience === outcome.audience && item.period === id
        );
        const event = evidence.bundle.sources.ga4.eventRows.find(
          (item) => item.eventName === outcome.eventName && item.period === id
        );
        return [
          outcome.audience,
          period(evidence, id)?.label ?? 'Unavailable',
          outcome.eventName ?? 'Measurement pending',
          outcome.measurement?.hostname ?? evidence.bundle.config.publicHostname,
          outcome.measurement?.metric ?? 'keyEvents',
          outcome.eventName === null
            ? null
            : outcome.measurement
              ? (row?.value ?? null)
              : (event?.keyEvents ?? null),
        ];
      })
    )
  );
  blocks.set('detail.journeyBoundary', [[context.journeyAssessment.explanation]]);
  blocks.set(
    'detail.funnel',
    context.journeyAssessment.steps.map((row) => [
      row.audience,
      row.step,
      row.population,
      row.count,
      `${row.window.startDate} to ${row.window.endDate}`,
      row.source.url,
    ])
  );
}

export function buildDetailedFacts(evidence: WorkbookEvidence, input: unknown): Blocks {
  const context = reportContextSchema.parse(input);
  const current = required(period(evidence, 'current'), 'current period');
  if (
    context.publicHostname !== evidence.bundle.config.publicHostname ||
    context.reportWindow.startDate !== current.startDate ||
    context.reportWindow.endDate !== current.endDate
  )
    throw new Error('Report context target/period differs from retained evidence');
  for (const article of context.editorial.articles) {
    if (
      classifyPath(
        article.path,
        evidence.bundle.config.audienceRegistry,
        evidence.bundle.config.unmatchedAudience
      ) !== article.audience
    )
      throw new Error('Editorial audience differs from collected cohort classification');
  }
  const blocks: Blocks = new Map();
  comparisons(blocks, evidence, context);
  articles(blocks, evidence, context);
  aiVisibility(blocks, context);
  highlights(blocks, evidence, context);
  outcomes(blocks, evidence, context);
  blocks.set('detail.provenance', [
    [`Editorial catalog ${context.editorial.version}; context SHA-256 ${sha256Json(context)}`],
  ]);
  return blocks;
}
