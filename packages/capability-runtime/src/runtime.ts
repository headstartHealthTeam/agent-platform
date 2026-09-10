import {
  capabilityPreflightResultSchema,
  capabilityRequirementSchema,
  executionProfileSchema,
  providerBindingSchema,
  type CapabilityPreflightResult,
  type CapabilityRequirement,
  type ExecutionProfile,
  type ProviderBinding,
} from '@headstart-health/capability-contracts';

export class CapabilityRuntimeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CapabilityRuntimeError';
  }
}

export function resolveCapabilityBinding(
  profileInput: ExecutionProfile,
  requirementInput: CapabilityRequirement
): ProviderBinding {
  const profile = executionProfileSchema.parse(profileInput);
  const requirement = capabilityRequirementSchema.parse(requirementInput);
  const binding = profile.bindings.find((candidate) => candidate.capabilityId === requirement.id);
  if (binding === undefined) {
    throw new CapabilityRuntimeError(
      `execution profile ${profile.id} does not bind required capability ${requirement.id}`
    );
  }
  return binding;
}

export function verifyCapabilityPreflight(
  requirementInput: CapabilityRequirement,
  bindingInput: ProviderBinding,
  resultInput: CapabilityPreflightResult
): CapabilityPreflightResult {
  const requirement = capabilityRequirementSchema.parse(requirementInput);
  const binding = providerBindingSchema.parse(bindingInput);
  const result = capabilityPreflightResultSchema.parse(resultInput);

  if (binding.capabilityId !== requirement.id) {
    throw new CapabilityRuntimeError(
      `binding capability ${binding.capabilityId} does not satisfy ${requirement.id}`
    );
  }
  if (
    result.capabilityId !== binding.capabilityId ||
    result.providerId !== binding.providerId ||
    result.adapterVersion !== binding.adapterVersion
  ) {
    throw new CapabilityRuntimeError(
      'preflight evidence does not match the selected provider binding'
    );
  }
  if (requirement.sideEffect !== 'read') {
    throw new CapabilityRuntimeError(
      `capability runtime currently accepts read-only requirements, received ${requirement.sideEffect}`
    );
  }
  if (result.status !== 'ready') {
    throw new CapabilityRuntimeError(
      `capability ${requirement.id} is not ready: ${result.status} (${result.message})`
    );
  }

  const grantedPermissions = new Set(result.permissions);
  const missingPermissions = requirement.requiredPermissions.filter(
    (permission) => !grantedPermissions.has(permission)
  );
  if (missingPermissions.length > 0) {
    throw new CapabilityRuntimeError(
      `capability ${requirement.id} is missing permissions: ${missingPermissions.join(', ')}`
    );
  }

  for (const assertion of requirement.targetAssertions) {
    if (result.targetIdentity[assertion.key] !== assertion.expected) {
      throw new CapabilityRuntimeError(
        `capability ${requirement.id} failed target assertion ${assertion.key}`
      );
    }
  }
  return result;
}

export function verifyExecutionReadiness(
  profileInput: ExecutionProfile,
  requirementsInput: readonly CapabilityRequirement[],
  resultsInput: readonly CapabilityPreflightResult[]
): readonly CapabilityPreflightResult[] {
  const profile = executionProfileSchema.parse(profileInput);
  const results = resultsInput.map((result) => capabilityPreflightResultSchema.parse(result));
  const resultsByCapability = new Map(results.map((result) => [result.capabilityId, result]));
  const verified: CapabilityPreflightResult[] = [];

  for (const requirementInput of requirementsInput) {
    const requirement = capabilityRequirementSchema.parse(requirementInput);
    const binding = resolveCapabilityBinding(profile, requirement);
    const result = resultsByCapability.get(requirement.id);
    if (result === undefined) {
      if (requirement.optional) {
        continue;
      }
      throw new CapabilityRuntimeError(
        `missing preflight evidence for required capability ${requirement.id}`
      );
    }
    verified.push(verifyCapabilityPreflight(requirement, binding, result));
  }
  return verified;
}
