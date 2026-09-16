import type {
  ModelPolicyMode,
  ProviderType,
} from '../generated/prisma/enums.js';

/**
 * The deployment-global policy governing which of a provider's catalog models end users
 * may select and run (SPEC-0012).
 *
 * `mode` is null while no mode has been chosen. That state is deliberately distinct from
 * DENY_ALL: it blocks enabling a cloud provider instead of silently governing it.
 */
export type ModelPolicy = {
  mode: ModelPolicyMode | null;
  allowedModels: string[];
};

export const UNCHOSEN_POLICY: ModelPolicy = { mode: null, allowedModels: [] };

/**
 * A cloud provider spends a shared remote credential, so it may not be enabled before a
 * policy mode is chosen. The local model worker costs nothing per call and is exempt.
 */
export const isCloudProvider = (type: ProviderType): boolean =>
  type !== 'MODEL_WORKER';

export const permitsModel = (policy: ModelPolicy, modelId: string): boolean =>
  policy.mode === 'ALLOW_ALL' ||
  (policy.mode === 'ALLOWLIST' && policy.allowedModels.includes(modelId));

export const toModelPolicy = (
  stored: { mode: ModelPolicyMode | null; allowedModels: string[] } | null,
): ModelPolicy =>
  stored
    ? { mode: stored.mode, allowedModels: stored.allowedModels }
    : UNCHOSEN_POLICY;
