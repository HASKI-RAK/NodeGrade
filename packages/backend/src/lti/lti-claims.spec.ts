import {
  LTI_CLAIM,
  LTI_ROLE,
  LTI_ROLE_VOCABULARY,
  isEditorRole,
  mapLaunchClaims,
  readAgsEndpointClaim,
  readNamesRoleServiceClaim,
  readOidcLoginRequest,
  type LtiIdTokenClaims,
} from '@haski/lti';

const claims = (overrides: Partial<LtiIdTokenClaims> = {}): LtiIdTokenClaims => ({
  iss: 'https://moodle.example.org',
  sub: 'user-1',
  aud: 'abc',
  exp: 2_000_000_000,
  iat: 1_900_000_000,
  nonce: 'n',
  [LTI_CLAIM.messageType]: 'LtiResourceLinkRequest',
  [LTI_CLAIM.version]: '1.3.0',
  [LTI_CLAIM.deploymentId]: '1',
  ...overrides,
});

describe('isEditorRole', () => {
  it.each([
    LTI_ROLE.instructor,
    LTI_ROLE.contextAdministrator,
    `${LTI_ROLE_VOCABULARY.membership}/Instructor#TeachingAssistant`,
    LTI_ROLE.institutionAdministrator,
    LTI_ROLE.systemAdministrator,
    'Instructor',
    'urn:lti:role:ims/lis/Administrator',
  ])('grants the editor to %s', (role) => {
    expect(isEditorRole(role)).toBe(true);
  });

  it.each([
    LTI_ROLE.learner,
    `${LTI_ROLE_VOCABULARY.membership}#Mentor`,
    LTI_ROLE.institutionInstructor,
    `${LTI_ROLE_VOCABULARY.institution}#Student`,
    'Learner',
    'urn:lti:role:ims/lis/Learner',
  ])('keeps %s on the student view', (role) => {
    expect(isEditorRole(role)).toBe(false);
  });
});

describe('mapLaunchClaims', () => {
  it('maps the context, resource link, roles and person', () => {
    const identity = mapLaunchClaims(
      claims({
        name: 'Ada Lovelace',
        email: 'ada@example.test',
        [LTI_CLAIM.roles]: [LTI_ROLE.instructor],
        [LTI_CLAIM.context]: { id: 'course-1', title: 'Analysis I' },
        [LTI_CLAIM.resourceLink]: { id: 'link-1', title: 'Exercise 3' },
        [LTI_CLAIM.custom]: { activityname: 'intro', ignored: 4 as unknown as string },
        [LTI_CLAIM.toolPlatform]: { guid: 'moodle-guid', name: 'Example University' },
      }),
    );

    expect(identity).toEqual({
      userId: 'user-1',
      roles: [LTI_ROLE.instructor],
      isInstructor: true,
      contextId: 'course-1',
      contextTitle: 'Analysis I',
      resourceLinkId: 'link-1',
      resourceLinkTitle: 'Exercise 3',
      custom: { activityname: 'intro' },
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      platformGuid: 'moodle-guid',
      platformName: 'Example University',
    });
  });

  it('falls back to given and family name, and to the context label', () => {
    const identity = mapLaunchClaims(
      claims({
        given_name: 'Ada',
        family_name: 'Lovelace',
        [LTI_CLAIM.roles]: [LTI_ROLE.learner],
        [LTI_CLAIM.context]: { id: 'course-1', label: 'ANA-1' },
      }),
    );

    expect(identity.name).toBe('Ada Lovelace');
    expect(identity.contextTitle).toBe('ANA-1');
    expect(identity.isInstructor).toBe(false);
  });

  it('leaves out what the platform did not send', () => {
    const identity = mapLaunchClaims(claims());

    expect(identity).toEqual({
      userId: 'user-1',
      roles: [],
      isInstructor: false,
      contextId: undefined,
      contextTitle: undefined,
      resourceLinkId: undefined,
      resourceLinkTitle: undefined,
      custom: {},
      name: undefined,
      email: undefined,
      platformGuid: undefined,
      platformName: undefined,
    });
  });
});

describe('readOidcLoginRequest', () => {
  it('reads the required and the optional fields', () => {
    expect(
      readOidcLoginRequest({
        iss: 'https://moodle.example.org',
        login_hint: '42',
        target_link_uri: 'https://grade.example.org/lti/launch',
        lti_message_hint: 'hint',
        client_id: 'abc',
        lti_deployment_id: '1',
      }),
    ).toEqual({
      iss: 'https://moodle.example.org',
      login_hint: '42',
      target_link_uri: 'https://grade.example.org/lti/launch',
      lti_message_hint: 'hint',
      client_id: 'abc',
      lti_deployment_id: '1',
    });
  });

  it('needs iss and login_hint, and an issuer that is a URL', () => {
    expect(readOidcLoginRequest({ iss: 'https://moodle.example.org' })).toBeNull();
    expect(readOidcLoginRequest({ login_hint: '42' })).toBeNull();
    expect(readOidcLoginRequest({ iss: 'moodle', login_hint: '42' })).toBeNull();
    expect(readOidcLoginRequest(null)).toBeNull();
  });

  it('rejects a target link that is not a URL', () => {
    expect(
      readOidcLoginRequest({
        iss: 'https://moodle.example.org',
        login_hint: '42',
        target_link_uri: 'javascript:alert(1)',
      }),
    ).toBeNull();
  });
});

describe('service claims', () => {
  it('reads the AGS endpoint a launch advertises', () => {
    expect(
      readAgsEndpointClaim({
        [LTI_CLAIM.agsEndpoint]: {
          scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
          lineitem: 'https://moodle.example.org/mod/lti/services.php/2/lineitems/7/lineitem',
        },
      }),
    ).toEqual({
      scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
      lineitems: undefined,
      lineitem: 'https://moodle.example.org/mod/lti/services.php/2/lineitems/7/lineitem',
    });
    expect(readAgsEndpointClaim({})).toBeUndefined();
  });

  it('reads the NRPS membership URL a launch advertises', () => {
    expect(
      readNamesRoleServiceClaim({
        [LTI_CLAIM.namesRoleService]: {
          context_memberships_url: 'https://moodle.example.org/mod/lti/services.php/CourseSection/2/bindings/3/memberships',
          service_versions: ['2.0'],
        },
      }),
    ).toEqual({
      context_memberships_url: 'https://moodle.example.org/mod/lti/services.php/CourseSection/2/bindings/3/memberships',
      service_versions: ['2.0'],
    });
    expect(readNamesRoleServiceClaim({})).toBeUndefined();
  });
});
