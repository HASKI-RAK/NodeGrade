import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { LtiBasicLaunchRequest } from '@haski/lti';

@Injectable()
export class LtiBasicLaunchValidationPipe
  implements PipeTransform<unknown, LtiBasicLaunchRequest>
{
  transform(value: unknown): LtiBasicLaunchRequest {
    if (!this.isLtiBasicLaunchRequest(value)) {
      throw new BadRequestException('Invalid LTI Basic Launch Request');
    }
    return value;
  }

  private isLtiBasicLaunchRequest(
    value: unknown,
  ): value is LtiBasicLaunchRequest {
    if (!value || typeof value !== 'object') return false;

    const required: Record<keyof Required<LtiBasicLaunchRequest>, string> = {
      user_id: 'number',
      roles: 'string',
      context_id: 'number',
      context_label: 'string',
      context_title: 'string',
      lti_message_type: 'string',
      resource_link_title: 'string',
      resource_link_id: 'number',
      context_type: 'string',
      lis_result_sourcedid: 'object',
      lis_outcome_service_url: 'string',
      lis_person_name_given: 'string',
      lis_person_name_family: 'string',
      lis_person_name_full: 'string',
      ext_user_username: 'string',
      lis_person_contact_email_primary: 'string',
      launch_presentation_locale: 'string',
      ext_lms: 'string',
      tool_consumer_info_product_family_code: 'string',
      tool_consumer_info_version: 'string',
      oauth_callback: 'string',
      lti_version: 'string',
      tool_consumer_instance_guid: 'string',
      tool_consumer_instance_name: 'string',
      tool_consumer_instance_description: 'string',
      launch_presentation_document_target: 'string',
      launch_presentation_return_url: 'string',
      custom_activityname: 'string',
      lis_person_sourcedid: 'string',
      resource_link_description: 'string',
      lis_course_section_sourcedid: 'string',
    };

    return Object.entries(required).every(([key, type]) => {
      if (!(key in value)) return false;
      const val = (value as Record<string, unknown>)[key];
      return type === 'object' ? typeof val === 'object' : typeof val === type;
    });
  }
}
