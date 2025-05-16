import {
  PipeTransform,
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { LtiBasicLaunchRequest } from '@haski/lti';

@Injectable()
export class LtiBasicLaunchValidationPipe
  implements PipeTransform<unknown, LtiBasicLaunchRequest>
{
  private readonly logger = new Logger(LtiBasicLaunchValidationPipe.name);

  transform(value: unknown): LtiBasicLaunchRequest {
    const { isValid, validationErrors } =
      this.validateLtiBasicLaunchRequest(value);

    if (!isValid) {
      const errorMessage = `Invalid LTI Basic Launch Request: ${validationErrors.join(', ')}`;
      this.logger.debug(`Validation failed: ${JSON.stringify(value)}`);
      this.logger.warn(errorMessage);
      throw new BadRequestException(errorMessage);
    }

    return value as LtiBasicLaunchRequest;
  }

  private validateLtiBasicLaunchRequest(value: unknown): {
    isValid: boolean;
    validationErrors: string[];
  } {
    const errors: string[] = [];

    if (!value || typeof value !== 'object') {
      return {
        isValid: false,
        validationErrors: ['Payload must be an object'],
      };
    }

    const required: Record<keyof Required<LtiBasicLaunchRequest>, string> = {
      user_id: 'string',
      roles: 'string',
      context_id: 'string',
      context_label: 'string',
      context_title: 'string',
      lti_message_type: 'string',
      resource_link_title: 'string',
      resource_link_id: 'string',
      context_type: 'string',
      // Updated this to accept either a string (serialized JSON) or an object
      lis_result_sourcedid: 'string_or_object',
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

    for (const [key, expectedType] of Object.entries(required)) {
      // Check if property exists
      if (!(key in value)) {
        errors.push(`Missing required property: ${key}`);
        continue;
      }

      // Check type of property
      const val = (value as Record<string, unknown>)[key];
      const actualType = typeof val;

      // Special handling for lis_result_sourcedid which can be a string (serialized JSON) or object
      if (
        key === 'lis_result_sourcedid' &&
        expectedType === 'string_or_object'
      ) {
        if (actualType === 'object') {
          // Already an object, which is fine
          continue;
        } else if (actualType === 'string') {
          try {
            // Try to parse as JSON with proper typing
            const stringVal = val as string;
            // Use type assertion to specify the parsed result is Record<string, unknown>
            const parsed: Record<string, unknown> = JSON.parse(
              stringVal,
            ) as Record<string, unknown>;

            if (typeof parsed === 'object' && parsed !== null) {
              // Valid JSON that parses to an object
              continue;
            }
          } catch (error) {
            // Using error parameter instead of e, and safe conversion to string
            this.logger.debug(
              `Failed to parse lis_result_sourcedid as JSON: ${String(val)} with error: ${String(
                error,
              )}`,
            );
          }
          // If we're here, it's a string but not valid JSON
          errors.push(
            `Invalid value for ${key}: expected a JSON string or object`,
          );
        } else {
          errors.push(
            `Invalid type for ${key}: expected string or object, got ${actualType}`,
          );
        }
      } else {
        // Normal type checking for other fields
        const typeIsValid =
          expectedType === 'object'
            ? actualType === 'object'
            : actualType === expectedType;

        if (!typeIsValid) {
          errors.push(
            `Invalid type for ${key}: expected ${expectedType}, got ${actualType}`,
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      validationErrors: errors,
    };
  }
}
