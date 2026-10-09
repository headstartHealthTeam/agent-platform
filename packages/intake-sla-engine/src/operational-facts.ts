import { addCommonOperationalFacts, addReportedInsuranceFact } from './operational-common-facts.js';
import { commonOperationalSignals } from './operational-common-signals.js';
import {
  createOperationalFactContext,
  dedupeOperationalFacts,
} from './operational-fact-context.js';
import type { DatedOperationalFact, OperationalFactInput } from './operational-fact-context.js';
import { addIaOperationalFacts } from './operational-ia-facts.js';
import { addInsuranceOperationalFacts } from './operational-insurance-facts.js';
import { addRbtOperationalFacts } from './operational-rbt-facts.js';
import { addTreatmentPlanOperationalFacts } from './operational-treatment-plan-facts.js';

export function extractOperationalFacts(input: OperationalFactInput): DatedOperationalFact[] {
  const context = createOperationalFactContext(input);
  const common = commonOperationalSignals(context);
  addCommonOperationalFacts(context, common);
  addIaOperationalFacts(context);
  addTreatmentPlanOperationalFacts(context);
  addReportedInsuranceFact(context);
  addInsuranceOperationalFacts(context, common.futureDiagnosticRequirement);
  addRbtOperationalFacts(context);
  return dedupeOperationalFacts(context.facts);
}
