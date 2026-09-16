import type { BundledTemplate } from './bundled-template.js';
import { demoWorkflowTemplate } from './demo-workflow.js';
import { feedbackGeneratorBlock } from './feedback-generator-block.js';
import { waieAssessmentTemplate } from './waie-assessment.js';

export type { BundledTemplate } from './bundled-template.js';

/** Everything the seeder installs on startup. Add a module and list it here. */
export const BUNDLED_TEMPLATES: BundledTemplate[] = [
  demoWorkflowTemplate,
  waieAssessmentTemplate,
  feedbackGeneratorBlock,
];
