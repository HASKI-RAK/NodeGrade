import type { BundledTemplate } from './bundled-template.js';
import { answerClassifierBlock } from './answer-classifier-block.js';
import { answerEquivalenceBlock } from './answer-equivalence-block.js';
import { demoWorkflowTemplate } from './demo-workflow.js';
import { extendedAssessmentLabTemplate } from './extended-assessment-lab.js';
import { feedbackGeneratorBlock } from './feedback-generator-block.js';
import { keywordCoverageBlock } from './keyword-coverage-block.js';
import { rubricScorerBlock } from './rubric-scorer-block.js';
import { scoreBlenderBlock } from './score-blender-block.js';
import { similarityScorerBlock } from './similarity-scorer-block.js';
import { simpleLlmFeedbackTemplate } from './simple-llm-feedback.js';
import { validationReviewBlock } from './validation-review-block.js';
import { waieAssessmentTemplate } from './waie-assessment.js';
import { workshopDifferentMistakesTemplate } from './workshop-different-mistakes.js';
import { workshopSameScoreDifferentGapsTemplate } from './workshop-same-score-different-gaps.js';
import { workshopWordsVsUnderstandingTemplate } from './workshop-words-vs-understanding.js';

export type { BundledTemplate } from './bundled-template.js';

/** Everything the seeder installs on startup. Add a module and list it here. */
export const BUNDLED_TEMPLATES: BundledTemplate[] = [
  demoWorkflowTemplate,
  waieAssessmentTemplate,
  workshopWordsVsUnderstandingTemplate,
  workshopSameScoreDifferentGapsTemplate,
  workshopDifferentMistakesTemplate,
  extendedAssessmentLabTemplate,
  simpleLlmFeedbackTemplate,
  feedbackGeneratorBlock,
  rubricScorerBlock,
  answerClassifierBlock,
  similarityScorerBlock,
  answerEquivalenceBlock,
  keywordCoverageBlock,
  scoreBlenderBlock,
  validationReviewBlock,
];

export const WORKSHOP_TEMPLATES: BundledTemplate[] = [
  workshopWordsVsUnderstandingTemplate,
  workshopSameScoreDifferentGapsTemplate,
  workshopDifferentMistakesTemplate,
];

/**
 * Slugs of bundled templates that shipped once and were replaced under a new slug. The
 * seeder unpublishes them so a deployment that installed them does not keep offering two
 * generations of the same workshop; revisions and derived workflows are left untouched.
 */
export const RETIRED_TEMPLATE_SLUGS: readonly string[] = [
  // The first workshop set used software-engineering examples (Strategy pattern, race
  // condition, deadlock); replaced by everyday-science examples so participants evaluate
  // the workflow rather than their own subject knowledge.
  'workshop-evidence-strategy',
  'workshop-rubric-race-condition',
  'workshop-classification-deadlock',
];
