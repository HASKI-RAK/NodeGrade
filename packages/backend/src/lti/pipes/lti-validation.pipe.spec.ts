import { Logger } from '@nestjs/common';
import { LtiBasicLaunchValidationPipe } from './lti-validation.pipe.js';

/** Every field the pipe requires of a 1.1 form, each filled with its own name. */
const REQUIRED_FIELDS = [
  'user_id',
  'roles',
  'context_id',
  'context_label',
  'context_title',
  'lti_message_type',
  'resource_link_title',
  'resource_link_id',
  'context_type',
  'lis_outcome_service_url',
  'lis_person_name_given',
  'lis_person_name_family',
  'lis_person_name_full',
  'ext_user_username',
  'lis_person_contact_email_primary',
  'launch_presentation_locale',
  'ext_lms',
  'tool_consumer_info_product_family_code',
  'tool_consumer_info_version',
  'oauth_callback',
  'lti_version',
  'tool_consumer_instance_guid',
  'tool_consumer_instance_name',
  'tool_consumer_instance_description',
  'launch_presentation_document_target',
  'launch_presentation_return_url',
  'custom_activityname',
  'lis_person_sourcedid',
  'resource_link_description',
  'lis_course_section_sourcedid',
];

const validForm = (): Record<string, unknown> => ({
  ...Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, field])),
  lis_result_sourcedid: '{"data":{"instanceid":"1"},"hash":"h"}',
});

describe('LtiBasicLaunchValidationPipe', () => {
  afterEach(() => jest.restoreAllMocks());

  const spyOnLogger = () =>
    (['log', 'warn', 'debug', 'error', 'verbose'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );

  const everythingLogged = (spies: ReturnType<typeof spyOnLogger>) =>
    spies.flatMap((spy) => spy.mock.calls.map((call) => String(call[0]))).join('\n');

  it('passes a complete form through unchanged', () => {
    const pipe = new LtiBasicLaunchValidationPipe();
    const form = validForm();

    expect(pipe.transform(form)).toBe(form);
  });

  it('accepts lis_result_sourcedid as an object as well', () => {
    const pipe = new LtiBasicLaunchValidationPipe();

    expect(() => pipe.transform({ ...validForm(), lis_result_sourcedid: { data: {} } })).not.toThrow();
  });

  it('names the missing and mistyped fields, and logs the error list only (NFR-001)', () => {
    const spies = spyOnLogger();
    const pipe = new LtiBasicLaunchValidationPipe();
    const { user_id: _dropped, ...form } = validForm();

    expect(() =>
      pipe.transform({
        ...form,
        roles: 7,
        lis_person_name_full: 'Ada Lovelace',
        lis_person_contact_email_primary: 'ada@example.test',
        lis_result_sourcedid: 'not json at all',
        oauth_signature: 'sig-secret',
      }),
    ).toThrow(/Missing required property: user_id, Invalid type for roles: expected string, got number/);

    const logged = everythingLogged(spies);
    expect(logged).toContain('Missing required property: user_id');
    expect(logged).not.toMatch(/Ada Lovelace|ada@example\.test|sig-secret|not json at all/);
  });

  it('refuses a payload that is not an object', () => {
    spyOnLogger();
    const pipe = new LtiBasicLaunchValidationPipe();

    expect(() => pipe.transform('user_id=7')).toThrow(/Payload must be an object/);
  });
});
