export interface FirefliesReportCoverage {
  readonly identityComplete: boolean;
  readonly coverageStatus: 'Complete' | 'Partial';
  readonly coverageDetail: string;
}
interface IdentityCoverage {
  readonly status?: string | null | undefined;
  readonly missing?: readonly string[] | null | undefined;
}
interface ReportCoverageInput {
  readonly opportunityId: string;
  readonly identity?: { readonly firefliesIdentityCoverage?: IdentityCoverage | null | undefined };
  readonly boundedCoverage?:
    | {
        readonly rows?: readonly { readonly opportunityId: string; readonly status: string }[];
        readonly resolutions?: readonly { readonly opportunityId: string }[];
      }
    | null
    | undefined;
  readonly row?:
    | {
        readonly searchCoverage?:
          { readonly status?: string | null | undefined } | null | undefined;
      }
    | null
    | undefined;
}
// The caller supplies readBoundedRunProof output, which revalidates original hashes.
export function firefliesReportCoverage({
  opportunityId,
  identity = {},
  boundedCoverage,
  row,
}: ReportCoverageInput): FirefliesReportCoverage {
  const resolved =
    boundedCoverage?.rows?.some(
      (value) => value.opportunityId === opportunityId && value.status === 'Complete'
    ) && boundedCoverage.resolutions?.some((value) => value.opportunityId === opportunityId);
  const coverage = identity.firefliesIdentityCoverage;
  const identityComplete = coverage?.status === 'Complete' || resolved === true;
  const searchComplete = row?.searchCoverage?.status === 'Complete';
  const status = coverage?.status;
  const missing = coverage?.missing;
  return {
    identityComplete,
    coverageStatus: identityComplete && searchComplete ? 'Complete' : 'Partial',
    coverageDetail: [
      !identityComplete
        ? `Provider identity coverage is ${typeof status === 'string' && status.length > 0 ? status : 'Blocked'}${missing && missing.length > 0 ? `; missing ${missing.join(', ')}` : ''}.`
        : '',
      !searchComplete
        ? 'Fireflies did not record a complete current-run participant, title, CSM, pagination, and transcript retrieval sweep.'
        : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}
export function firefliesIdentityConfidence(
  coverage: Pick<FirefliesReportCoverage, 'identityComplete'>,
  identityMatchReview: unknown
): string {
  const hasIdentityReview = Boolean(identityMatchReview);
  return hasIdentityReview
    ? 'Likely - verification required'
    : coverage.identityComplete
      ? 'High'
      : 'Partial';
}
