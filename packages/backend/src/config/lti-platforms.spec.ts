import { LtiConfigurationError, parseLtiPlatforms } from './lti-platforms.js';

const moodle = {
  issuer: 'https://moodle.example.org',
  clientId: 'abc123',
  deploymentIds: ['1'],
  authorizationEndpoint: 'https://moodle.example.org/mod/lti/auth.php',
  tokenEndpoint: 'https://moodle.example.org/mod/lti/token.php',
  jwksUri: 'https://moodle.example.org/mod/lti/certs.php',
  name: 'Example Moodle',
};

describe('parseLtiPlatforms', () => {
  it('treats an unset or empty variable as no platforms', () => {
    expect(parseLtiPlatforms(undefined)).toEqual([]);
    expect(parseLtiPlatforms('  ')).toEqual([]);
  });

  it('parses a registration and trims its values', () => {
    const [platform] = parseLtiPlatforms(
      JSON.stringify([{ ...moodle, clientId: ' abc123 ', deploymentIds: [' 1 '] }]),
    );

    expect(platform).toEqual(moodle);
  });

  it('names the variable when the JSON does not parse', () => {
    expect(() => parseLtiPlatforms('{not json')).toThrow(LtiConfigurationError);
    expect(() => parseLtiPlatforms('{not json')).toThrow(
      /LTI_PLATFORMS is not valid JSON/,
    );
  });

  it('requires an array of objects', () => {
    expect(() => parseLtiPlatforms('{"issuer":"x"}')).toThrow(/must be a JSON array/);
    expect(() => parseLtiPlatforms('[1]')).toThrow(/platform 1 must be an object/);
  });

  it('names the entry and the field that is missing', () => {
    const { clientId: _dropped, ...withoutClient } = moodle;

    expect(() => parseLtiPlatforms(JSON.stringify([moodle, withoutClient]))).toThrow(
      'LTI_PLATFORMS: platform 2 needs a non-empty "clientId".',
    );
  });

  it('requires absolute URLs for the endpoints', () => {
    expect(() =>
      parseLtiPlatforms(JSON.stringify([{ ...moodle, jwksUri: 'certs.php' }])),
    ).toThrow(/"jwksUri" must be an absolute URL/);
  });

  it('requires at least one deployment id', () => {
    expect(() =>
      parseLtiPlatforms(JSON.stringify([{ ...moodle, deploymentIds: [] }])),
    ).toThrow(/"deploymentIds"/);
  });

  it('refuses the same issuer and client id twice', () => {
    expect(() => parseLtiPlatforms(JSON.stringify([moodle, moodle]))).toThrow(
      /platform 2 repeats issuer/,
    );
  });

  it('lets one issuer carry several client ids', () => {
    const platforms = parseLtiPlatforms(
      JSON.stringify([moodle, { ...moodle, clientId: 'other' }]),
    );

    expect(platforms).toHaveLength(2);
  });
});
