import type { LtiPlatformRegistration } from '@haski/lti';

const EXAMPLE =
  '[{"issuer":"https://moodle.example.org","clientId":"abc123","deploymentIds":["1"],"authorizationEndpoint":"https://moodle.example.org/mod/lti/auth.php","tokenEndpoint":"https://moodle.example.org/mod/lti/token.php","jwksUri":"https://moodle.example.org/mod/lti/certs.php","name":"Example Moodle"}]';

/** A misconfigured LTI environment stops the backend with this before it listens. */
export class LtiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LtiConfigurationError';
  }
}

const describe = (index: number): string =>
  `LTI_PLATFORMS: platform ${index + 1}`;

const text = (value: unknown, field: string, index: number): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new LtiConfigurationError(
      `${describe(index)} needs a non-empty "${field}".`,
    );
  }
  return value.trim();
};

const url = (value: unknown, field: string, index: number): string => {
  const trimmed = text(value, field, index);
  try {
    new URL(trimmed);
  } catch {
    throw new LtiConfigurationError(
      `${describe(index)}: "${field}" must be an absolute URL, got "${trimmed}".`,
    );
  }
  return trimmed;
};

const deploymentIds = (value: unknown, index: number): string[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((id) => typeof id === 'string' && id.trim().length > 0)
  ) {
    throw new LtiConfigurationError(
      `${describe(index)} needs "deploymentIds", a non-empty array of strings.`,
    );
  }
  return (value as string[]).map((id) => id.trim());
};

/**
 * Parses LTI_PLATFORMS, the JSON array of platforms allowed to launch this tool
 * (SPEC-0023/FR-001).
 *
 * A registration is what the platform shows after the admin registers NodeGrade:
 * Moodle under "View configuration details", Canvas on the developer key. Validation
 * happens here, at startup, so a typo surfaces as one readable line instead of as a
 * refused launch during a course.
 */
export function parseLtiPlatforms(
  raw: string | undefined,
): LtiPlatformRegistration[] {
  if (raw === undefined || raw.trim().length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new LtiConfigurationError(
      `LTI_PLATFORMS is not valid JSON (${reason}). Expected a JSON array of platform registrations, for example ${EXAMPLE}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new LtiConfigurationError(
      `LTI_PLATFORMS must be a JSON array of platform registrations, for example ${EXAMPLE}`,
    );
  }

  const platforms = parsed.map((entry, index): LtiPlatformRegistration => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new LtiConfigurationError(
        `${describe(index)} must be an object with issuer, clientId, deploymentIds, authorizationEndpoint, tokenEndpoint and jwksUri.`,
      );
    }
    const record = entry as Record<string, unknown>;
    return {
      issuer: url(record.issuer, 'issuer', index),
      clientId: text(record.clientId, 'clientId', index),
      deploymentIds: deploymentIds(record.deploymentIds, index),
      authorizationEndpoint: url(
        record.authorizationEndpoint,
        'authorizationEndpoint',
        index,
      ),
      tokenEndpoint: url(record.tokenEndpoint, 'tokenEndpoint', index),
      jwksUri: url(record.jwksUri, 'jwksUri', index),
      ...(typeof record.name === 'string' && record.name.trim().length > 0
        ? { name: record.name.trim() }
        : {}),
    };
  });

  const seen = new Set<string>();
  platforms.forEach((platform, index) => {
    const key = `${platform.issuer}\u0000${platform.clientId}`;
    if (seen.has(key)) {
      throw new LtiConfigurationError(
        `${describe(index)} repeats issuer "${platform.issuer}" with client id "${platform.clientId}".`,
      );
    }
    seen.add(key);
  });

  return platforms;
}
