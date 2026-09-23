export {
  SOURCE_CONTRACT,
  STAGE_CONTRACT,
  assertContractFingerprint,
  getStageContract,
  getStageOrder,
  isExcludedOpportunity,
  isExcludedStage,
  isSupportingOnlyEvidence,
  isSupportingOnlySource,
  stageContractSchema,
  validateStageContract,
} from './contracts.js';
export type {
  OpportunityDisposition,
  SlaDisposition,
  StageContract,
  StageDefinition,
} from './contracts.js';
export {
  calendarAgeDays,
  freshnessFor,
  isoDate,
  nextBusinessDay,
  parseEmbeddedDate,
  toDate,
} from './dates.js';
export type { DateValue } from './dates.js';
export { EVIDENCE_ENGINE_VERSION, INTAKE_SOURCE_REVISION } from './engine-version.js';
export { canonicalJson, sha256Json } from './json-fingerprint.js';
export { assessBillingClaims, selectBillingClaimAppointments } from './billing-claims.js';
export {
  BILLING_EVIDENCE_CONTRACT,
  assertBillingCollectionReceipt,
  billingClaimsQuery,
  billingCollectionReceipt,
  groupBillingClaims,
} from './billing-collection.js';
export { normalizeBillingClaimAppointments } from './billing-normalization.js';
export type { BillingCollectionReceipt } from './billing-collection.js';
export type {
  BillingAppointment,
  BillingAssessmentInput,
  BillingClaim,
  BillingOpportunity,
  BillingState,
  SelectedBillingAppointment,
} from './billing-types.js';
export {
  approvedEvidence,
  compareEvidence,
  createEvidenceEvent,
  evidenceRank,
  evidenceSpecificity,
  newestRelevantEvidence,
} from './evidence.js';
export type { EvidenceEvent, EvidenceInput, RankedEvidence } from './evidence.js';
export {
  createSourceResult,
  materialSourceFailure,
  sourceCoverageComplete,
  sourceStatusSchema,
  supplementarySourceFailure,
} from './source-result.js';
export type { SourceResult, SourceResultInput, SourceStatus } from './source-result.js';
export { compareProductionFingerprint, sha256 } from './drift.js';
export type {
  ActualProductionFingerprint,
  FingerprintChange,
  FingerprintComparison,
  FlowFingerprint,
  ProductionFingerprint,
} from './drift.js';
export { resolveAuthorizationGate } from './authorization-gate.js';
export {
  treatmentAuthorizationSubmitted,
  treatmentPlanEnteredReview,
} from './authorization-record.js';
export type {
  AuthorizationGate,
  AuthorizationGateInput,
  AuthorizationRecord,
  AuthorizationState,
  DenialDetails,
} from './authorization-types.js';
export { resolveIaOccurrence } from './ia-occurrence.js';
export { resolveGate } from './gate-engine.js';
export type { ActiveGate, ExcludedGate, GateInput, ResolvedGate } from './gate-engine.js';
export { categoryForGate, isVobRelevantGate, refineGateWithEvidence } from './gate-context.js';
export type { GateContext, GateOpportunity, GateRefinement } from './gate-context.js';
export type {
  AssessmentAppointment,
  AssessmentOpportunity,
  AssessmentProviderEvent,
  IaOccurrence,
  IaOccurrenceInput,
} from './ia-occurrence-types.js';
