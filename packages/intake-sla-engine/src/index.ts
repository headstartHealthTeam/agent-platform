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
export {
  candidateMatchIsActive,
  candidateMatchRank,
  selectCurrentCandidateMatch,
} from './candidate-match.js';
export type { CandidateMatch } from './candidate-match.js';
export {
  CLIENT_IDENTITY_ALIASES,
  clientIdentityAliasesFor,
  clientIdentityRegistryMatches,
} from './client-identity.js';
export type {
  ClientIdentityEntry,
  ClientIdentityRegistry,
  ClientIdentityInput,
} from './client-identity.js';
export { normalizeClientName, nameEditDistance } from './client-name.js';
export { matchRosterOpportunity, normalizeRosterValue } from './roster-matching.js';
export type { RosterCandidate, RosterMatch, RosterMatchInput } from './roster-matching.js';
export { buildIdentityProfile } from './identity-profile.js';
export type { IdentityProfile, IdentityProfileInput, ProfileProvider } from './identity-profile.js';
export { assessTextMatch, stageTerms } from './text-match.js';
export type { TextMatch, TextMatchIdentity, TextMatchInput } from './text-match.js';
export { segmentTranscript } from './transcript-segments.js';
export type {
  MatchSentence,
  TranscriptSegment,
  SegmentTranscriptInput,
} from './transcript-segments.js';
export { scoreConversationMatch } from './conversation-match.js';
export type {
  ConversationProfile,
  ConversationProvider,
  ConversationMatch,
  ConversationMatchInput,
  ConversationScoreBreakdown,
} from './conversation-match-types.js';
export {
  createConversationSearchResult,
  evaluateConversationSourceHealth,
} from './conversation-search-result.js';
export type {
  SearchMatch,
  ConversationSearchInput,
  ConversationSearchResult,
  ConversationHealthInput,
  ConversationSourceHealth,
  ConversationMatchCounts,
} from './conversation-search-result.js';
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
  canonicalEvidenceSource,
  coreEvidenceEvents,
  dedupeEvidenceEvents,
} from './evidence-assembly.js';
export type { CoreEvidenceRow, AssembledEvidenceEvent } from './evidence-assembly.js';
export { assertInterpretationCandidate } from './precomputed-candidate.js';
export type {
  PrecomputedFinding,
  PrecomputedCandidate,
  CandidateTarget,
} from './precomputed-candidate.js';
export { finalizeCurrentRunPrecomputed } from './precomputed-interpretation.js';
export type {
  PrecomputedCandidateInput,
  CurrentRunPrecomputedInput,
  CurrentRunInterpretation,
  CurrentRunPrecomputedArtifact,
} from './precomputed-interpretation.js';
export { createNoteAdjudicator } from './note-adjudication.js';
export type {
  NoteGate,
  NoteAdjudicationInput,
  NoteAdjudicationPacket,
  NoteAdjudicationReceipt,
  NoteAdjudicator,
  NoteEvidenceEvent,
} from './note-adjudication-types.js';
export { verifyNoteAdjudicationArtifacts } from './note-adjudication-storage.js';
export { adjudicatedNoteFreshnessInput } from './note-freshness.js';
export type { NoteOpportunity } from './note-freshness.js';
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
export { resolveStageEntryDate } from './stage-entry.js';
export type { StageEntryOpportunity, StageTransition } from './stage-entry.js';
export { isUsableStageEvidence, sourceOutcome } from './source-outcome.js';
export type {
  SourceCheck,
  SourceOutcome,
  SourceOutcomeInput,
  StageEvidence,
} from './source-outcome.js';
export {
  applyStageSourceRequirements,
  blockingRequiredSources,
  enforceConversationInterpretationRequirement,
  isProviderFacingStage,
  requiredSourcesForContext,
} from './source-requirements.js';
export type { SourceContext, SourceRequirementResult } from './source-requirements.js';
export { slackSweepCoverage } from './slack-coverage.js';
export type { SlackSweepCoverage, SlackSweepExecution, SlackSweepRow } from './slack-coverage.js';
export {
  APPROVED_INTERPRETER_MODEL,
  APPROVED_INTERPRETER_PROVIDER,
  INTERPRETATION_BINDING_VERSION,
  assertInterpretationBinding,
  createInterpretationBinding,
  createInterpretationValidationBinding,
  interpretationBindingDiff,
  interpreterConfigFromEnv,
} from './interpretation-binding.js';
export type {
  InterpretationBinding,
  InterpretationBindingInput,
  InterpretationValidationBinding,
  InterpretationValidationInput,
  InterpreterConfig,
  InterpreterEnvironment,
} from './interpretation-binding.js';
export { runBoundedWorkers } from './bounded-worker-pool.js';
export type { BoundedWorkerOptions, WorkerProgress } from './bounded-worker-pool.js';
export {
  FIREFLIES_CACHE_VERSION,
  FIREFLIES_DISCOVERY_ADAPTER_VERSION,
  FirefliesCacheError,
  cacheTimestamp,
  validateCachePolicy,
} from './fireflies-cache-contract.js';
export type {
  FirefliesCachePolicy,
  FirefliesCollectionWindow,
  FirefliesDiscovery,
} from './fireflies-cache-contract.js';
export { normalizeFirefliesDiscovery, validateDiscovery } from './fireflies-discovery.js';
export type { DiscoveryNormalizationReceipt } from './fireflies-discovery.js';
export { planFirefliesCache, transcriptContentHash } from './fireflies-cache-plan.js';
export type {
  FirefliesCachePlan,
  FirefliesCachePlanInput,
  FirefliesCachePlanItem,
} from './fireflies-cache-plan.js';
export { materializeFirefliesCache } from './fireflies-cache-materialize.js';
export type {
  CacheMaterializationInput,
  CacheTranscriptProvenance,
  FirefliesCacheMaterialization,
  FirefliesCacheReport,
  MaterializedCacheEntry,
  MaterializedCacheIndex,
} from './fireflies-cache-materialize.js';
export { verifyFirefliesCacheRun } from './fireflies-cache-verify.js';
export type { VerifiedFirefliesCacheReport } from './fireflies-cache-verify.js';
export { loadCache, saveCache, readFirefliesDiscovery } from './fireflies-cache-storage.js';
export type { LoadedFirefliesCache } from './fireflies-cache-storage.js';
export { readCacheRunProof } from './fireflies-cache-replay-proof.js';
export type {
  CacheReplayVerification,
  FirefliesCacheRunProof,
} from './fireflies-cache-replay-proof.js';
export { parseFirefliesProfiles } from './fireflies-profile.js';
export { providerIdentityInputFromSources } from './provider-identity-input.js';
export type { ProviderSourceIdentityInput } from './provider-identity-input.js';
export {
  buildProviderIdentityCluster,
  buildProviderRoleClusters,
  providerClusterAnchors,
} from './provider-identity.js';
export type {
  IdentityProvider,
  IdentityValue,
  ProviderIdentityInput,
  ProviderIdentityCluster,
  ProviderIdentityRegistry,
  ProviderRoleCluster,
  ProviderSourceIdentity,
  ProviderValue,
} from './provider-identity-types.js';
export {
  providerFirefliesSearchPlan,
  providerFirefliesSearchPlans,
  assessFirefliesIdentityCoverage,
} from './provider-search.js';
export type {
  ProviderSearchInput,
  ProviderFirefliesSearchPlan,
  RoleFirefliesSearchPlan,
  FirefliesIdentityCoverage,
} from './provider-search.js';
export { firefliesClientSearchVariants, firefliesStageTerms } from './provider-search-terms.js';
export { proposeFirefliesParticipantIdentities } from './provider-participant-proposals.js';
export type {
  ProviderMeetingIdentityEvidence,
  ParticipantIdentityProposal,
} from './provider-participant-proposals.js';
export {
  buildFirefliesCollectionPlan,
  buildRunLevelFirefliesCollectionPlan,
  buildFirefliesTranscriptRetrievalPlan,
} from './fireflies-collection.js';
export type {
  FirefliesProfile,
  FirefliesOpportunityPlan,
  FirefliesMeetingRequest,
  FirefliesRunCollectionPlan,
  RunMeetingRequest,
} from './fireflies-collection.js';
export { assessFirefliesSearchExecution } from './fireflies-search-execution.js';
export type {
  FirefliesSearchAssessment,
  FirefliesSearchAttempt,
  FirefliesSearchExecution,
} from './fireflies-search-execution.js';
export { checkpointPlan, connectorCheckpoint, requireContract } from './connector-checkpoint.js';
export type {
  CheckpointPlan,
  CheckpointProgress,
  CheckpointRequest,
} from './connector-checkpoint.js';
export { selectFirefliesCollectionMode } from './fireflies-collection-mode.js';
export {
  atomicPrivateWrite,
  localArtifactPath,
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withCacheLock,
  withRunCheckpointLock,
  writeIdenticalOrNew,
  writePrivateJson,
} from './private-run-storage.js';
export type { WriterLockOptions } from './private-run-storage.js';
export { assessTranscriptInventoryArtifact } from './run-artifact-health.js';
export type { TranscriptInventoryHealth } from './run-artifact-health.js';
export { FIREFLIES_BOUNDED_VERSION } from './fireflies-bounded-contract.js';
export type {
  BoundedInputs,
  BoundedRow,
  BoundedIssue,
  BoundedSearchAttempt,
  BoundedFallbackSkip,
  CandidateMeeting,
  FirefliesCandidateManifest,
} from './fireflies-bounded-contract.js';
export { buildFirefliesCandidateManifest } from './fireflies-bounded.js';
export { validateCandidateBody, verifyCandidateInventory } from './fireflies-candidate-body.js';
export { resolveBoundedCoverage } from './fireflies-bounded-coverage.js';
export type { BoundedCoverage, BoundedCoverageResolution } from './fireflies-bounded-coverage.js';
export { boundedInputs } from './fireflies-bounded-files.js';
export { readBoundedRunProof } from './fireflies-bounded-proof.js';
export type { BoundedRunProof } from './fireflies-bounded-proof.js';
export {
  planBoundedCollection,
  acceptCandidateBodies,
  captureCandidateResponse,
  boundedCollectionStatus,
  finalizeBoundedCollection,
} from './fireflies-bounded-storage.js';
export type { BoundedCollectionStatus, PendingCandidate } from './fireflies-bounded-storage.js';
export { executeFirefliesReads } from './fireflies-read-executor.js';
export type { FirefliesReadOptions } from './fireflies-read-executor.js';
export {
  interpretationBindingForPacket,
  interpretationValidationBindingForPacket,
  interpretTranscriptPacketWithAI,
  interpretTranscriptSegmentWithAI,
} from './ai-interpretation.js';
export type {
  PacketBindingInput,
  PacketInterpretation,
  PacketInterpretationInput,
} from './ai-interpretation.js';
export {
  INTERPRETER_INSTRUCTIONS,
  TRANSCRIPT_INTERPRETATION_SCHEMA,
} from './interpretation-contract.js';
export {
  aiFindingAsOperationalFact,
  validateTranscriptFindings,
} from './interpretation-findings.js';
export type {
  AiOperationalFact,
  FindingContext,
  TranscriptFindingInput,
  ValidatedTranscriptFinding,
} from './interpretation-findings.js';
export {
  buildTranscriptInterpretationPacket,
  interpretationGateContext,
} from './interpretation-packet.js';
export type {
  InterpretationJson,
  InterpretationPacketInput,
  InterpretationProfile,
  TranscriptInterpretationPacket,
} from './interpretation-packet.js';
export {
  groupInterpretationsByOpportunity,
  interpretationKey,
  planInterpretationDelta,
} from './bounded-delta-interpretation.js';
export type {
  CompletedInterpretationItem,
  InterpretationArtifact,
  InterpretationDeltaInput,
  InterpretationDeltaItem,
  InterpretationDeltaPlan,
  InterpretationEnvelope,
  OpportunityInterpretations,
  SavedInterpretation,
} from './bounded-delta-interpretation.js';
export type {
  AssessmentAppointment,
  AssessmentOpportunity,
  AssessmentProviderEvent,
  IaOccurrence,
  IaOccurrenceInput,
} from './ia-occurrence-types.js';
