/**
 * Headless live run of the bundled workshop templates against the real KATALYST vLLM
 * deployment, without a database, browser or Socket.IO in the loop.
 *
 *   KATALYST_API_KEY=… SIMILARITY_WORKER_URL=http://localhost:18000 \
 *     yarn workspace backend workshop:live [slug ...]
 *
 * `CASE=<substring>` restricts the run to test answers whose label contains it;
 * `KATALYST_BASE_URL` overrides the vLLM endpoint; `DUMP_RAW=1` prints each model reply
 * as a JSON string (line breaks visible) plus the tail of its reasoning.
 *
 * For every template it runs each predefined test answer through the same LGraph path
 * the server uses (`configure` → hydrate → `executeLgraph`) and prints every model
 * response with its finish reason and token usage, extracted number and output value.
 * It exists so a facilitator can see the graphs behave with the deployed model before
 * standing in front of a room.
 */
import { createOpenAI } from '@ai-sdk/openai';
import {
  AnswerInputNode,
  KATALYST_MODEL_QWEN_FLASH,
  LGraph,
  LLMNode,
  type ModelCompletionRequest,
  type ModelCompletionResult,
  type ModelCompletionRuntime,
  type SerializedGraph,
} from '@haski/ta-lib';
import { generateText, type ModelMessage } from 'ai';
import { executeLgraph } from '../src/core/Graph.js';
import { WORKSHOP_TEMPLATES } from '../src/template/bundled/index.js';
import type { BundledTemplate } from '../src/template/bundled/index.js';

const KATALYST_BASE_URL =
  process.env.KATALYST_BASE_URL?.trim() ||
  'https://vllm.katalyst-education.de/v1';

const TEST_ANSWERS: Record<string, { label: string; answer: string }[]> = {
  'workshop-words-vs-understanding': [
    {
      label: 'everyday wording, none of the expected words (intended CORRECT)',
      answer:
        'Our planet turns. When our part points towards the Sun it is bright, and when it turns away it is dark.',
    },
    {
      label: 'every expected word, wrong explanation (intended MISCONCEPTION)',
      answer:
        "Day and night do not happen because of Earth's rotation around its axis. They happen because the Sun circles Earth, changing where sunlight falls.",
    },
    {
      label: 'correct as far as it goes (intended INCOMPLETE)',
      answer: 'Because Earth turns.',
    },
    {
      label: 'explicit misconception (intended MISCONCEPTION)',
      answer: 'Because clouds cover the Sun at night.',
    },
  ],
  'workshop-same-score-different-gaps': [
    {
      label: 'A: collection missing (target 6/8)',
      answer:
        'Water changes into a gas and enters the air. As it cools, it changes back into tiny drops that form clouds. Water then falls back to the ground as rain.',
    },
    {
      label: 'B: cloud formation missing (target 6/8)',
      answer:
        'Water changes into a gas and enters the air. Water falls back to the ground as rain, then gathers in rivers and lakes.',
    },
    {
      label: 'C: complete in everyday words (target 8/8)',
      answer:
        'Water from lakes and the sea turns into a gas and rises into the air. High up it cools and turns back into tiny drops, and those drops make clouds. The drops fall down as rain, and the rain runs into rivers and lakes, so it can start again.',
    },
    {
      label: 'D: vague (target low)',
      answer: 'Water goes up and then it comes down again.',
    },
  ],
  'workshop-different-mistakes-different-help': [
    {
      label: 'correct',
      answer:
        'A half is bigger because dividing the same pizza into fewer equal pieces makes each piece larger.',
    },
    {
      label: 'incomplete',
      answer: 'A half is bigger.',
    },
    {
      label: 'misconception',
      answer: 'A quarter is bigger because four is bigger than two.',
    },
    {
      label: 'irrelevant',
      answer: 'I like pizza with mushrooms.',
    },
    {
      label: 'contradictory',
      answer:
        'A half is larger than a quarter. A quarter is also larger than a half for these same-sized pizzas.',
    },
  ],
};

const apiKey = process.env.KATALYST_API_KEY?.trim();
if (!apiKey) throw new Error('KATALYST_API_KEY is required for a live run.');

const openai = createOpenAI({
  name: 'nodegrade-katalyst-live',
  baseURL: KATALYST_BASE_URL,
  apiKey,
});

const runtime: ModelCompletionRuntime = {
  async complete(
    request: ModelCompletionRequest,
  ): Promise<ModelCompletionResult> {
    if (request.modelRef.modelId !== KATALYST_MODEL_QWEN_FLASH)
      throw new Error(`Unexpected model ${request.modelRef.modelId}`);
    const messages: ModelMessage[] = request.messages.map((message) => ({
      role: message.role === 'system' ? 'system' : 'user',
      content: message.content,
    }));
    const result = await generateText({
      model: openai.chat(request.modelRef.modelId),
      messages,
      abortSignal: request.signal,
      maxOutputTokens: request.parameters.max_tokens,
      temperature: request.parameters.temperature,
      topP: request.parameters.top_p,
    });
    // Reasoning tokens count against max_tokens on this deployment; a `length` finish
    // means the visible reply was cut off (or never started), which is the main way a
    // stage fails silently.
    const { finishReason, usage } = result;
    const budget = `finish=${finishReason} output=${usage.outputTokens ?? '?'} reasoning=${usage.reasoningTokens ?? '?'} of ${request.parameters.max_tokens}`;
    console.log(
      finishReason === 'stop' ? `      [${budget}]` : `      !! [${budget}]`,
    );
    if (process.env.DUMP_RAW) {
      console.log(
        `      raw text: ${JSON.stringify(result.text)}\n      raw reasoning tail: ${JSON.stringify(result.reasoningText?.slice(-600))}`,
      );
    }
    return { text: result.text, warnings: [] };
  },
};

const nodeEnv = {
  SIMILARITY_WORKER_URL:
    process.env.SIMILARITY_WORKER_URL ?? 'http://localhost:18000',
  MODEL_WORKER_URL: process.env.MODEL_WORKER_URL ?? 'http://localhost:18000',
};

const INSPECTED_TYPES = new Set([
  'models/llm',
  'preprocessing/extract-number',
  'math/math-operation',
  'math/precision',
  'text/keyword-check',
  'models/cosine-similarity',
]);

const indent = (text: string) =>
  text
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');

const runOnce = async (template: BundledTemplate, answer: string) => {
  const lgraph = new LGraph();
  lgraph.configure(
    JSON.parse(JSON.stringify(template.content)) as SerializedGraph,
  );
  const outputs: { label: string; value: unknown }[] = [];
  for (const node of lgraph._nodes) {
    node.env = nodeEnv;
    if (node instanceof LLMNode) node.setRuntime(runtime);
    if (typeof node.init === 'function') await node.init(nodeEnv);
    node.emitEventCallback = (event) => {
      if (event.eventName === 'outputSet') {
        const payload = event.payload as { label: string; value: unknown };
        outputs.push({ label: payload.label, value: payload.value });
      }
    };
  }
  for (const node of lgraph.findNodesByClass(AnswerInputNode))
    node.properties.value = answer;

  const started = Date.now();
  await executeLgraph(lgraph, undefined, false, {
    timeoutMs: 180_000,
    onNodeEvent: (event) => {
      if (event.state === 'failed')
        console.log(`    ✗ ${event.node.title}: ${event.error?.message}`);
      if (
        event.state !== 'completed' ||
        !INSPECTED_TYPES.has(event.node.type ?? '')
      )
        return;
      const values = (event.outputs ?? []).map((output) =>
        typeof output.value === 'string'
          ? output.value.trim()
          : JSON.stringify(output.value),
      );
      console.log(
        `    · ${event.node.title} (${event.durationMs} ms)\n${indent(values.join('\n'))}`,
      );
    },
  });
  console.log(`    — outputs after ${Date.now() - started} ms:`);
  for (const output of outputs) {
    const value =
      typeof output.value === 'string'
        ? output.value.trim()
        : JSON.stringify(output.value);
    console.log(`    ▶ ${output.label}\n${indent(value)}`);
  }
};

const requested = new Set(process.argv.slice(2));
const caseFilter = process.env.CASE?.toLowerCase();
const templates = WORKSHOP_TEMPLATES.filter(
  (template) => requested.size === 0 || requested.has(template.slug),
);

for (const template of templates) {
  console.log(`\n======== ${template.slug} ========`);
  for (const test of TEST_ANSWERS[template.slug] ?? []) {
    if (caseFilter && !test.label.toLowerCase().includes(caseFilter)) continue;
    console.log(`\n  ## ${test.label}\n     "${test.answer}"`);
    try {
      await runOnce(template, test.answer);
    } catch (error) {
      console.log(`    RUN FAILED: ${String(error)}`);
    }
  }
}
