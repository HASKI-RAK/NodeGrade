import {
  detectPolarity,
  extractNumbers,
  hardCheck,
  hasAmbiguousNumber,
  KeywordCheckNode,
  normalizeAnswer,
  SemanticEquivalenceNode,
  splitIntoSpans,
} from '@haski/ta-lib';

/**
 * The stages that decide without a network. These carry the cases embeddings
 * get wrong — opposites and quantities — so they are the ones worth pinning.
 */
describe('semantic equivalence rules', () => {
  it('strips casing, spacing and edge punctuation but not word endings', () => {
    expect(normalizeAnswer('  “Rotation.” ')).toBe('rotation');
    expect(normalizeAnswer('The  Earth\tturns')).toBe('the earth turns');
    // A stemmer here would merge "rotates" into "rotation"; the embedding
    // stage is meant to make that call, not this one.
    expect(normalizeAnswer('rotates')).toBe('rotates');
  });

  it('reads numbers written either way round', () => {
    expect(extractNumbers('3,14')).toEqual([3.14]);
    expect(extractNumbers('3.14')).toEqual([3.14]);
    expect(extractNumbers('1.234,56 and 1,234.56')).toEqual([1234.56, 1234.56]);
    expect(extractNumbers('no digits here')).toEqual([]);
  });

  it('stands down on a number only the locale could resolve', () => {
    // "1.000" is one thousand in German and one in English, with nothing in
    // the text to say which, so the number rule must not decide the answer.
    expect(hasAmbiguousNumber('1.000')).toBe(true);
    expect(hasAmbiguousNumber('3,14')).toBe(false);
    expect(hardCheck('1000', '1.000')).toBeUndefined();
  });

  it('recognises a polarity only when it is the whole answer', () => {
    expect(detectPolarity('Ja')).toBe('affirmative');
    expect(detectPolarity('falsch')).toBe('negative');
    expect(detectPolarity('No, the Earth turns')).toBeUndefined();
  });

  it.each([
    ['Yes', 'Yes', true, 'exact'],
    ['No', 'Yes', false, 'polarity-mismatch'],
    ['Correct', 'Yes', true, 'polarity-match'],
    ['Nein', 'Ja', false, 'polarity-mismatch'],
    ['42', '17', false, 'number-mismatch'],
    ['3,14', '3.14', true, 'number-match'],
    ['The answer is 50 metres', 'The answer is 5 metres', false, 'number-mismatch'],
  ])('settles %s against %s without a model', (answer, expected, equivalent, reason) => {
    expect(hardCheck(answer, expected)).toEqual({ equivalent, reason });
  });

  it('leaves wording to the model stages', () => {
    expect(hardCheck('goes up', 'increases')).toBeUndefined();
    expect(hardCheck('seventeen', '17')).toBeUndefined();
    // Equal numbers with different wording are not settled either: "5 metres"
    // and "5 seconds" agree numerically and mean different things.
    expect(hardCheck('5 seconds', '5 metres')).toBeUndefined();
  });

  it('honours the opt-outs', () => {
    expect(hardCheck('No', 'Yes', { checkPolarity: false })).toBeUndefined();
    expect(hardCheck('42', '17', { checkNumbers: false })).toBeUndefined();
  });

  it('offers each sentence as its own span, plus the whole text', () => {
    expect(splitIntoSpans('The Earth turns. The Sun lights one side.')).toEqual([
      'The Earth turns. The Sun lights one side.',
      'The Earth turns.',
      'The Sun lights one side.',
    ]);
    expect(splitIntoSpans('One sentence only')).toEqual(['One sentence only']);
    expect(splitIntoSpans('   ')).toEqual([]);
  });
});

type WorkerReply = { status?: number; body: unknown };

/** Answers `/similarity` and `/entailment` from a script, and records the calls. */
const stubWorker = (replies: Record<string, WorkerReply>) => {
  const calls: { path: string; body: unknown }[] = [];
  global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, body: JSON.parse(String(init?.body ?? '{}')) });
    const reply = replies[path];
    if (!reply) return { ok: false, status: 404, json: async () => ({}) };
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      json: async () => reply.body,
    };
  }) as unknown as typeof fetch;
  return calls;
};

const runEquivalence = async (
  answer: string,
  expected: string,
  replies: Record<string, WorkerReply>,
  properties: Partial<SemanticEquivalenceNode['properties']> = {},
) => {
  const calls = stubWorker(replies);
  const node = new SemanticEquivalenceNode();
  node.env = { SIMILARITY_WORKER_URL: 'http://worker' };
  Object.assign(node.properties, properties);
  node.getInputData = jest.fn((slot: number) =>
    slot === 0 ? answer : expected,
  ) as never;
  const outputs: unknown[] = [];
  node.setOutputData = jest.fn((slot: number, value: unknown) => {
    outputs[slot] = value;
  }) as never;
  await node.onExecute();
  return { outputs, calls };
};

const entailmentReply = (
  forward: [number, number, number],
  backward: [number, number, number],
) => ({
  body: {
    results: [forward, backward].map(([entailment, neutral, contradiction]) => ({
      entailment,
      neutral,
      contradiction,
      label:
        contradiction > entailment && contradiction > neutral
          ? 'contradiction'
          : entailment > neutral
            ? 'entailment'
            : 'neutral',
    })),
  },
});

describe('SemanticEquivalenceNode', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('decides a yes/no pair without asking the worker at all', async () => {
    const { outputs, calls } = await runEquivalence('No', 'Yes', {});
    expect(outputs[0]).toBe(false);
    expect(outputs[2]).toBe('polarity-mismatch');
    expect(calls).toHaveLength(0);
  });

  it('rejects below the floor without asking for entailment', async () => {
    const { outputs, calls } = await runEquivalence(
      'the French Revolution',
      'photosynthesis',
      { '/similarity': { body: { scores: [0.44] } } },
    );
    expect(outputs[0]).toBe(false);
    expect(outputs[1]).toBeCloseTo(0.44);
    expect(outputs[2]).toBe('cosine-low');
    expect(calls.map((call) => call.path)).toEqual(['/similarity']);
  });

  it('lets a contradiction override a high similarity', async () => {
    // This is the case a threshold cannot reach: the two sentences are as
    // close as two sentences get, and mean opposite things.
    const { outputs } = await runEquivalence(
      'The reaction is endothermic',
      'The reaction is exothermic',
      {
        '/similarity': { body: { scores: [0.9] } },
        '/entailment': entailmentReply(
          [0.005, 0.017, 0.978],
          [0.004, 0.02, 0.976],
        ),
      },
    );
    expect(outputs[0]).toBe(false);
    expect(outputs[2]).toBe('nli-contradiction');
  });

  it('accepts a paraphrase that entails in both directions', async () => {
    const { outputs, calls } = await runEquivalence('goes up', 'increases', {
      '/similarity': { body: { scores: [0.815] } },
      '/entailment': entailmentReply(
        [0.987, 0.011, 0.001],
        [0.96, 0.03, 0.01],
      ),
    });
    expect(outputs[0]).toBe(true);
    expect(outputs[2]).toBe('nli-entailment');
    const entailment = calls.find((call) => call.path === '/entailment');
    // Both directions, expected answer first: entailment is asymmetric.
    expect(entailment?.body).toEqual({
      pairs: [
        ['increases', 'goes up'],
        ['goes up', 'increases'],
      ],
    });
  });

  it('falls back to the cosine ceiling when the worker has no NLI model', async () => {
    const { outputs } = await runEquivalence('almost the same', 'the same', {
      '/similarity': { body: { scores: [0.8] } },
      '/entailment': { status: 503, body: { error: 'disabled' } },
    });
    expect(outputs[0]).toBe(false);
    expect(outputs[2]).toBe('nli-unavailable');
  });

  it('reports empty input instead of scoring it', async () => {
    const { outputs, calls } = await runEquivalence('   ', 'Yes', {});
    expect(outputs[0]).toBe(false);
    expect(outputs[2]).toBe('empty-input');
    expect(calls).toHaveLength(0);
  });
});

describe('KeywordCheckNode semantic mode', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const run = async (keywords: string, text: string, scores: number[][]) => {
    const queue = [...scores];
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ scores: queue.shift() ?? [] }),
    })) as unknown as typeof fetch;
    const node = new KeywordCheckNode();
    node.env = { SIMILARITY_WORKER_URL: 'http://worker' };
    node.properties.useSemantic = true;
    node.getInputData = jest.fn((slot: number) =>
      slot === 0 ? keywords : text,
    ) as never;
    const outputs: unknown[] = [];
    node.setOutputData = jest.fn((slot: number, value: unknown) => {
      outputs[slot] = value;
    }) as never;
    await node.onExecute();
    return { outputs, fetchCalls: jest.mocked(global.fetch).mock.calls };
  };

  it('never asks the worker about a keyword that literally appears', async () => {
    const { outputs, fetchCalls } = await run(
      'rotation, axis',
      'Rotation happens around an axis.',
      [],
    );
    expect(outputs[0]).toBe('rotation, axis');
    expect(outputs[1]).toBe('');
    expect(fetchCalls).toHaveLength(0);
  });

  it('scores a keyword against its best sentence, not the whole answer', async () => {
    // Whole text first, then each sentence. The keyword matches the second
    // sentence; against the whole answer it would sit under the threshold.
    const { outputs, fetchCalls } = await run(
      'sunlight',
      'The Earth turns. One side faces the Sun and is lit.',
      [[0.41, 0.2, 0.68]],
    );
    expect(outputs[0]).toBe('sunlight');
    expect(outputs[1]).toBe('');
    expect(fetchCalls).toHaveLength(1);
    expect(JSON.parse(String(fetchCalls[0][1]?.body))).toEqual({
      source: 'sunlight',
      targets: [
        'The Earth turns. One side faces the Sun and is lit.',
        'The Earth turns.',
        'One side faces the Sun and is lit.',
      ],
    });
  });

  it('counts a keyword missing when no span clears the threshold', async () => {
    const { outputs } = await run('photosynthesis', 'The Earth turns.', [
      [0.21],
    ]);
    expect(outputs[0]).toBe('');
    expect(outputs[1]).toBe('photosynthesis');
  });
});
