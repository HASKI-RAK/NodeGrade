/**
 * Headless run of the answer-equivalence flow against a real NLP worker, with no
 * database, browser, Socket.IO or language model in the loop.
 *
 *   SIMILARITY_WORKER_URL=http://localhost:8002 \
 *     yarn workspace backend tsx ./scripts/run-equivalence-demo.ts
 *
 * Each case is executed through the same LGraph path the server uses
 * (`configure` → hydrate → `executeLgraph`), twice: once through
 * `models/sentence-transformer` + `models/cosine-similarity` at the old 0.7
 * cutoff, and once through `text/semantic-equivalence`. Printing both side by
 * side is the point — it shows which cases the cosine score gets wrong and
 * which stage of the cascade catches them.
 *
 * The first `/entailment` request loads the NLI model and can take half a
 * minute; every later one is fast.
 */
import {
  AnswerInputNode,
  LGraph,
  type SerializedGraph,
} from '@haski/ta-lib';
import { executeLgraph } from '../src/core/Graph.js';
import { GraphBuilder } from '../src/template/bundled/graph-builder.js';

type Case = {
  expected: string;
  answer: string;
  /** What a grader would say. */
  shouldPass: boolean;
};

const CASES: Case[] = [
  { expected: 'Yes', answer: 'Yes', shouldPass: true },
  { expected: 'Yes', answer: 'No', shouldPass: false },
  { expected: 'Yes', answer: 'Correct', shouldPass: true },
  { expected: 'Ja', answer: 'Nein', shouldPass: false },
  { expected: 'increases', answer: 'goes up', shouldPass: true },
  { expected: 'increases', answer: 'decreases', shouldPass: false },
  { expected: '17', answer: '42', shouldPass: false },
  { expected: '17', answer: 'seventeen', shouldPass: true },
  { expected: '3.14', answer: '3,14', shouldPass: true },
  {
    expected: 'The answer is 5 metres',
    answer: 'The answer is 50 metres',
    shouldPass: false,
  },
  {
    expected: 'The Earth rotates on its axis',
    answer: 'Our planet turns around itself.',
    shouldPass: true,
  },
  {
    expected: 'The Earth rotates on its axis',
    answer: 'The Sun circles the Earth.',
    shouldPass: false,
  },
  {
    expected: 'Die Erde dreht sich um ihre Achse',
    answer: 'Die Erde rotiert.',
    shouldPass: true,
  },
  { expected: 'mitosis', answer: 'meiosis', shouldPass: false },
  {
    expected: 'The reaction is exothermic',
    answer: 'The reaction is endothermic',
    shouldPass: false,
  },
];

/** The cutoff the node shipped with before the cascade existed. */
const LEGACY_COSINE_CUTOFF = 0.7;

const nodeEnv = {
  SIMILARITY_WORKER_URL:
    process.env.SIMILARITY_WORKER_URL ?? 'http://localhost:8002',
  MODEL_WORKER_URL: process.env.MODEL_WORKER_URL ?? 'http://localhost:8002',
};

/** Answer and expected answer through both flows, in one graph, per case. */
const buildGraph = (expected: string): SerializedGraph => {
  const g = new GraphBuilder();
  const answer = g.answer('Learner answer', [40, 80], {
    minChars: 1,
    maxChars: 1500,
  });
  const reference = g.textfield('Expected answer', [40, 260], expected);

  // Flow A — what the blocks did before: embed both sides, compare, threshold.
  const embedAnswer = g.sentenceTransformer('Embed answer', [420, 80], answer);
  const embedReference = g.sentenceTransformer(
    'Embed expected',
    [420, 200],
    reference,
  );
  const cosine = g.cosineSimilarity(
    'Cosine similarity',
    [800, 140],
    embedAnswer,
    embedReference,
  );
  g.output('cosine', [1180, 140], cosine, 0, 'score');

  // Flow B — the cascade.
  const cleanAnswer = g.clean('Normalize answer', [420, 420]);
  g.link(answer, 0, cleanAnswer, 0);
  const cleanReference = g.clean('Normalize expected', [420, 600]);
  g.link(reference, 0, cleanReference, 0);
  const equivalence = g.semanticEquivalence(
    'Semantic equivalence',
    [800, 480],
    cleanAnswer,
    cleanReference,
  );
  g.output('equivalent', [1180, 420], equivalence, 0);
  g.output('similarity', [1180, 560], equivalence, 1, 'score');
  g.output('verdict', [1180, 700], equivalence, 2);

  return g.build() as unknown as SerializedGraph;
};

const runOnce = async (testCase: Case) => {
  const lgraph = new LGraph();
  lgraph.configure(buildGraph(testCase.expected));
  const outputs = new Map<string, unknown>();
  for (const node of lgraph._nodes) {
    node.env = nodeEnv;
    if (typeof node.init === 'function') await node.init(nodeEnv);
    node.emitEventCallback = (event) => {
      if (event.eventName !== 'outputSet') return;
      const payload = event.payload as { label: string; value: unknown };
      outputs.set(payload.label, payload.value);
    };
  }
  for (const node of lgraph.findNodesByClass(AnswerInputNode))
    node.properties.value = testCase.answer;

  const failures: string[] = [];
  await executeLgraph(lgraph, undefined, false, {
    timeoutMs: 180_000,
    onNodeEvent: (event) => {
      if (event.state === 'failed')
        failures.push(`${event.node.title}: ${event.error?.message}`);
    },
  });
  return { outputs, failures };
};

const tick = (correct: boolean) => (correct ? ' ' : 'X');

let cosineCorrect = 0;
let cascadeCorrect = 0;

console.log(`worker: ${nodeEnv.SIMILARITY_WORKER_URL}\n`);
console.log(
  `${'want'.padEnd(6)}${'cos'.padStart(6)} ${'cos>=.7'.padEnd(9)}${'cascade'.padEnd(9)}${'decided by'.padEnd(20)}pair`,
);

for (const testCase of CASES) {
  const { outputs, failures } = await runOnce(testCase);
  if (failures.length > 0) {
    console.log(`FAILED ${failures.join('; ')}`);
    continue;
  }
  const cosine = Number(outputs.get('cosine') ?? 0);
  const equivalent = outputs.get('equivalent') === true;
  const verdict = String(outputs.get('verdict') ?? '');
  const cosineVerdict = cosine >= LEGACY_COSINE_CUTOFF;
  if (cosineVerdict === testCase.shouldPass) cosineCorrect += 1;
  if (equivalent === testCase.shouldPass) cascadeCorrect += 1;
  console.log(
    `${String(testCase.shouldPass).padEnd(6)}${cosine.toFixed(3).padStart(6)} ` +
      `${String(cosineVerdict).padEnd(6)}${tick(cosineVerdict === testCase.shouldPass)}  ` +
      `${String(equivalent).padEnd(6)}${tick(equivalent === testCase.shouldPass)}  ` +
      `${verdict.padEnd(20)}${JSON.stringify(testCase.expected)} / ${JSON.stringify(testCase.answer)}`,
  );
}

const total = CASES.length;
console.log(
  `\ncosine >= ${LEGACY_COSINE_CUTOFF}: ${cosineCorrect}/${total}` +
    `\ncascade:        ${cascadeCorrect}/${total}`,
);
