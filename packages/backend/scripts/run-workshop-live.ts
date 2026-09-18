/**
 * Headless live run of the bundled workshop templates against the real KATALYST vLLM
 * deployment, without a database, browser or Socket.IO in the loop.
 *
 *   KATALYST_API_KEY=… SIMILARITY_WORKER_URL=http://localhost:18000 \
 *     yarn workspace backend workshop:live [slug ...]
 *
 * `CASE=<substring>` restricts the run to test answers whose label contains it;
 * `KATALYST_BASE_URL` overrides the vLLM endpoint.
 *
 * For every template it runs each predefined test answer through the same LGraph path
 * the server uses (`configure` → hydrate → `executeLgraph`) and prints every model
 * response, extracted number and output value. It exists so a facilitator can see the
 * graphs behave with the deployed model before standing in front of a room.
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
  'workshop-evidence-strategy': [
    {
      label: 'slide answer (vague)',
      answer:
        'The Strategy pattern is when you make a class for every method and then the program can choose one.',
    },
    {
      label: 'plausible, no keywords',
      answer:
        'The caller keeps a replaceable object exposing the same operation and delegates the work to it. Another implementation can be plugged in without rewriting the caller.',
    },
    {
      label: 'all keywords, wrong relationships',
      answer:
        'The context does not delegate to a strategy; a common interface is unnecessary and the behaviors are not interchangeable.',
    },
  ],
  'workshop-rubric-race-condition': [
    {
      label: 'A: mitigation missing (target 80)',
      answer:
        'An increment reads the counter, adds one and writes it back. Both threads can read zero before either writes; both then write one, so one update is lost.',
    },
    {
      label: 'B: consequence missing (target 80)',
      answer:
        'An increment is a separate read, calculation and write. Both threads can read the same old value before either writes. Protect the entire increment with a mutex.',
    },
    {
      label: 'C: vague (target low)',
      answer: 'Because both threads access the variable.',
    },
  ],
  'workshop-classification-deadlock': [
    {
      label: 'correct mechanism',
      answer: 'A holds X and waits for Y, while B holds Y and waits for X.',
    },
    {
      label: 'incomplete',
      answer: 'The threads block each other.',
    },
    {
      label: 'misconception',
      answer: 'It is slow because both threads use the CPU at the same time.',
    },
    {
      label: 'contradictory',
      answer:
        'A is waiting for a lock held by B, but neither thread is waiting for anything.',
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
