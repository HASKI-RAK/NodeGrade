import type { BundledTemplate } from './bundled-template.js';
import { demoWorkflowTemplate } from './demo-workflow.js';
import { extendedAssessmentLabTemplate } from './extended-assessment-lab.js';
import { feedbackGeneratorBlock } from './feedback-generator-block.js';
import { simpleLlmFeedbackTemplate } from './simple-llm-feedback.js';
import { waieAssessmentTemplate } from './waie-assessment.js';
import { workshopClassificationDeadlockTemplate } from './workshop-classification-deadlock.js';
import { workshopEvidenceStrategyTemplate } from './workshop-evidence-strategy.js';
import { workshopRubricRaceConditionTemplate } from './workshop-rubric-race-condition.js';

export type { BundledTemplate } from './bundled-template.js';

/** Everything the seeder installs on startup. Add a module and list it here. */
export const BUNDLED_TEMPLATES: BundledTemplate[] = [
  demoWorkflowTemplate,
  waieAssessmentTemplate,
  workshopEvidenceStrategyTemplate,
  workshopRubricRaceConditionTemplate,
  workshopClassificationDeadlockTemplate,
  extendedAssessmentLabTemplate,
  simpleLlmFeedbackTemplate,
  feedbackGeneratorBlock,
];

export const WORKSHOP_TEMPLATES: BundledTemplate[] = [
  workshopEvidenceStrategyTemplate,
  workshopRubricRaceConditionTemplate,
  workshopClassificationDeadlockTemplate,
];
