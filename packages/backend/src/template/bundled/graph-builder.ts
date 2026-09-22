import {
  DEFAULT_FLAG_PATTERN,
  DEFAULT_HIGH_THRESHOLD as EQUIVALENCE_HIGH_THRESHOLD,
  DEFAULT_KEYWORD_THRESHOLD as KEYWORD_SIMILARITY_THRESHOLD,
  DEFAULT_LOW_THRESHOLD as EQUIVALENCE_LOW_THRESHOLD,
  DEFAULT_REASON_PREFIX,
  KATALYST_MODEL_QWEN_FLASH,
  PROVIDER_KEY_KATALYST,
} from '@haski/ta-lib';
import type { GraphContent, GraphNode } from '../template-content.js';

/**
 * Declarative construction of bundled graph content.
 *
 * Hand-writing a LiteGraph serialization means keeping four things in agreement by eye:
 * the `link` id on every input slot, the `links` array on every output slot, the global
 * `links` table, and `last_node_id`/`last_link_id`. A workshop graph with forty nodes and
 * fifty links is exactly where that agreement breaks. The builder owns the bookkeeping;
 * the template module only declares nodes and which slot feeds which.
 *
 * Slot declarations mirror what each node's constructor adds. They are a static table on
 * purpose: instantiating LiteGraph nodes at import time would couple template modules to
 * registration order, and the bundled-template spec already proves the result loads.
 */

type Slot = { name: string; type: string };

type SlotTable = { inputs: Slot[]; outputs: Slot[] };

const slot = (name: string, type = name): Slot => ({ name, type });

const NODE_SLOTS: Record<string, SlotTable> = {
  'input/question': { inputs: [], outputs: [slot('string')] },
  'input/answer': { inputs: [], outputs: [slot('string')] },
  'input/sample-solution': { inputs: [], outputs: [slot('string')] },
  'basic/textfield': { inputs: [], outputs: [slot('string')] },
  'basic/number': { inputs: [], outputs: [slot('number')] },
  'basic/sum': {
    inputs: [slot('A', 'number'), slot('B', 'number')],
    outputs: [slot('A+B', 'number')],
  },
  'utils/concat-string': {
    inputs: [slot('string'), slot('string')],
    outputs: [slot('string')],
  },
  'utils/concat-object': {
    inputs: [slot('*', '*'), slot('*', '*')],
    outputs: [slot('*', '*')],
  },
  'utils/strings-to-array': {
    inputs: [slot('string'), slot('string')],
    outputs: [slot('[string]', '[string]')],
  },
  'basic/prompt-message': {
    inputs: [slot('string')],
    outputs: [slot('message')],
  },
  // Both message ports take text, a message, or a list of either (SPEC-0019/FR-001),
  // which is why the prompt text below reaches them without a `prompt-message` node
  // in between. `LGraphNode.onConfigure` restores these types on load, so older
  // stored content gains the same acceptance without a reissue.
  'models/llm': {
    inputs: [
      slot('message', 'message,string,[message]'),
      slot('messages', 'message,[message],[string],string'),
    ],
    outputs: [slot('string')],
  },
  'preprocessing/extract-number': {
    inputs: [slot('string')],
    outputs: [slot('number')],
  },
  'math/math-operation': {
    inputs: [slot('number'), slot('number')],
    outputs: [slot('number')],
  },
  'math/precision': { inputs: [slot('number')], outputs: [slot('number')] },
  'preprocessing/clean': {
    inputs: [slot('string')],
    outputs: [slot('string')],
  },
  'text/keyword-check': {
    inputs: [
      slot('keywords (comma-separated)', 'string'),
      slot('text', 'string'),
    ],
    outputs: [
      slot('present keywords', 'string'),
      slot('missing keywords', 'string'),
    ],
  },
  'text/semantic-equivalence': {
    inputs: [slot('answer', 'string'), slot('expected answer', 'string')],
    outputs: [
      slot('equivalent', 'boolean'),
      slot('similarity', 'number'),
      slot('verdict', 'string'),
    ],
  },
  'models/sentence-transformer': {
    inputs: [slot('string')],
    outputs: [slot('[number]')],
  },
  'models/cosine-similarity': {
    inputs: [slot('[number]'), slot('[number]')],
    outputs: [slot('number')],
  },
  'output/output': { inputs: [slot('*')], outputs: [] },
  // Mirrors `ReviewFlagNode`: `addIn(['string', 'boolean'], 'signal')`, so the stored
  // slot type is the comma-joined form `onConfigure` restores on load.
  'output/review-flag': {
    inputs: [slot('signal', 'string,boolean')],
    outputs: [slot('flagged', 'boolean')],
  },
};

export type NodeRef = { readonly id: number; readonly type: string };

type Link = [number, number, number, number, number, string];

type Group = {
  title: string;
  bounding: [number, number, number, number];
  color: string;
  font_size: number;
};

type NodeSpec = {
  type: string;
  title: string;
  pos: [number, number];
  size?: [number, number];
  properties?: Record<string, unknown>;
  widgetsValues?: unknown[];
};

type PendingNode = NodeSpec & { id: number };

/** Model parameters every workshop LLM node starts with. */
export type LlmSettings = {
  maxTokens: number;
  temperature: number;
};

/**
 * KATALYST's Qwen deployment always reasons before it answers and the reasoning tokens
 * count against `max_tokens`. A budget sized for the visible reply alone therefore
 * truncates or empties the reply. Live runs showed the feedback stage deliberating for
 * ~1900 reasoning tokens on an answer that missed every criterion, so 2048 was not
 * enough; 4096 leaves headroom on every stage below.
 */
export const KATALYST_LLM: LlmSettings = { maxTokens: 4096, temperature: 0.1 };

export const katalystLlmProperties = ({
  maxTokens,
  temperature,
}: LlmSettings): Record<string, unknown> => ({
  value: KATALYST_MODEL_QWEN_FLASH,
  model: KATALYST_MODEL_QWEN_FLASH,
  model_ref: {
    providerKey: PROVIDER_KEY_KATALYST,
    modelId: KATALYST_MODEL_QWEN_FLASH,
  },
  needs_model_selection: false,
  max_tokens: maxTokens,
  temperature,
  top_p: 0.9,
  top_k: 40,
  presence_penalty: 0,
});

const katalystLlmWidgets = ({
  maxTokens,
  temperature,
}: LlmSettings): unknown[] => [
  maxTokens,
  temperature,
  0.9,
  40,
  0,
  KATALYST_MODEL_QWEN_FLASH,
];

export class GraphBuilder {
  private readonly nodes: PendingNode[] = [];
  private readonly links: Link[] = [];
  private readonly groups: Group[] = [];

  add(spec: NodeSpec): NodeRef {
    if (!NODE_SLOTS[spec.type])
      throw new Error(`GraphBuilder has no slot table for ${spec.type}`);
    const id = this.nodes.length + 1;
    this.nodes.push({ ...spec, id });
    return { id, type: spec.type };
  }

  /** Connects `from`'s output slot to `to`'s input slot and returns the link id. */
  link(from: NodeRef, fromSlot: number, to: NodeRef, toSlot: number): number {
    const outputs = NODE_SLOTS[from.type].outputs;
    const inputs = NODE_SLOTS[to.type].inputs;
    const output = outputs[fromSlot];
    const input = inputs[toSlot];
    if (!output)
      throw new Error(`${from.type}#${from.id} has no output slot ${fromSlot}`);
    if (!input)
      throw new Error(`${to.type}#${to.id} has no input slot ${toSlot}`);
    const occupied = this.links.find(
      ([, , , targetId, targetSlot]) =>
        targetId === to.id && targetSlot === toSlot,
    );
    if (occupied)
      throw new Error(
        `${to.type}#${to.id} input ${toSlot} is already fed by link ${occupied[0]}`,
      );
    const id = this.links.length + 1;
    this.links.push([id, from.id, fromSlot, to.id, toSlot, output.type]);
    return id;
  }

  group(title: string, bounding: Group['bounding'], color: string): void {
    this.groups.push({ title, bounding, color, font_size: 24 });
  }

  // ---- Node conveniences -------------------------------------------------------------

  question(title: string, pos: [number, number], value: string): NodeRef {
    return this.add({
      type: 'input/question',
      title,
      pos,
      size: [340, 150],
      properties: { value },
    });
  }

  answer(
    title: string,
    pos: [number, number],
    bounds: { minChars: number; maxChars: number },
  ): NodeRef {
    return this.add({
      type: 'input/answer',
      title,
      pos,
      size: [340, 90],
      properties: { value: '', ...bounds },
    });
  }

  sampleSolution(title: string, pos: [number, number], value: string): NodeRef {
    return this.add({
      type: 'input/sample-solution',
      title,
      pos,
      size: [340, 170],
      properties: { value },
    });
  }

  textfield(
    title: string,
    pos: [number, number],
    value: string,
    size: [number, number] = [340, 120],
  ): NodeRef {
    return this.add({
      type: 'basic/textfield',
      title,
      pos,
      size,
      properties: { precision: 1, value },
    });
  }

  /** `upper` then `lower`, separated by a single space (the node's only join mode). */
  concat(
    title: string,
    pos: [number, number],
    upper?: NodeRef,
    lower?: NodeRef,
    slots: { upper?: number; lower?: number } = {},
  ): NodeRef {
    const node = this.add({
      type: 'utils/concat-string',
      title,
      pos,
      size: [310, 80],
      properties: { value: '', space: true },
      widgetsValues: [true],
    });
    if (upper) this.link(upper, slots.upper ?? 0, node, 0);
    if (lower) this.link(lower, slots.lower ?? 0, node, 1);
    return node;
  }

  /**
   * Joins any number of string sources in order through a chain of concat nodes laid out
   * downwards from `pos`. Returns the node carrying the fully assembled string.
   */
  join(
    title: string,
    pos: [number, number],
    parts: readonly NodeRef[],
    rowHeight = 110,
  ): NodeRef {
    if (parts.length < 2) throw new Error(`${title}: join needs two parts`);
    const [first, second, ...rest] = parts;
    const step = (index: number) => `${title} ${index + 1}/${parts.length - 1}`;
    let assembled = this.concat(step(0), pos, first, second);
    rest.forEach((part, index) => {
      assembled = this.concat(
        step(index + 1),
        [pos[0], pos[1] + (index + 1) * rowHeight],
        assembled,
        part,
      );
    });
    return assembled;
  }

  /**
   * A system message on the singular `message` port and prompt text on the
   * aggregate `messages` port. The node sends slot 0 before slot 1, so the
   * conversation reads system-then-user without a `prompt-message` node or a
   * `concat-object` to assemble it (SPEC-0019/FR-009).
   *
   * Leaves `model_ref` unset so execution substitutes the facilitator's
   * deployment default at run time (SPEC-0016); stored content stays untouched.
   */
  llmWithSystem(
    title: string,
    pos: [number, number],
    systemMessage: NodeRef,
    prompt: NodeRef,
    settings: LlmSettings = KATALYST_LLM,
  ): NodeRef {
    const node = this.add({
      type: 'models/llm',
      title,
      pos,
      size: [320, 220],
      properties: {
        value: '',
        model: '',
        model_ref: null,
        needs_model_selection: true,
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
        top_p: 0.9,
        top_k: 40,
        presence_penalty: 0,
      },
      widgetsValues: [settings.maxTokens, settings.temperature, 0.9, 40, 0, ''],
    });
    this.link(systemMessage, 0, node, 0);
    this.link(prompt, 0, node, 1);
    return node;
  }

  /** Prompt text straight into the singular `message` port (SPEC-0019/FR-002). */
  llm(
    title: string,
    pos: [number, number],
    prompt: NodeRef,
    settings: LlmSettings = KATALYST_LLM,
  ): NodeRef {
    const node = this.add({
      type: 'models/llm',
      title,
      pos,
      size: [320, 220],
      properties: katalystLlmProperties(settings),
      widgetsValues: katalystLlmWidgets(settings),
    });
    this.link(prompt, 0, node, 0);
    return node;
  }

  /**
   * Prompt text → model. The model keeps the position it had when a
   * `prompt-message` node stood between the two, so the surrounding groups and
   * columns of a workshop graph still line up.
   */
  llmStage(
    title: string,
    pos: [number, number],
    prompt: NodeRef,
    settings: LlmSettings = KATALYST_LLM,
  ): NodeRef {
    return this.llm(`${title} model`, [pos[0] + 460, pos[1]], prompt, settings);
  }

  extractNumber(
    title: string,
    pos: [number, number],
    source: NodeRef,
  ): NodeRef {
    const node = this.add({
      type: 'preprocessing/extract-number',
      title,
      pos,
      size: [320, 60],
      properties: { value: '' },
    });
    this.link(source, 0, node, 0);
    return node;
  }

  math(
    title: string,
    pos: [number, number],
    operation: '+' | '-' | '*' | '/',
    left: NodeRef,
    right: NodeRef,
  ): NodeRef {
    const node = this.add({
      type: 'math/math-operation',
      title,
      pos,
      size: [420, 90],
      properties: { operation, valueOne: 0, valueTwo: 0 },
      widgetsValues: [operation],
    });
    this.link(left, 0, node, 0);
    this.link(right, 0, node, 1);
    return node;
  }

  precision(
    title: string,
    pos: [number, number],
    source: NodeRef,
    digits: number,
  ): NodeRef {
    const node = this.add({
      type: 'math/precision',
      title,
      pos,
      size: [260, 80],
      properties: { value: -1, precision: digits },
      widgetsValues: [digits],
    });
    this.link(source, 0, node, 0);
    return node;
  }

  keywordCheck(
    title: string,
    pos: [number, number],
    keywords?: NodeRef,
    text?: NodeRef,
    options: { useSemantic?: boolean; threshold?: number } = {},
  ): NodeRef {
    const { useSemantic = false, threshold = KEYWORD_SIMILARITY_THRESHOLD } =
      options;
    const node = this.add({
      type: 'text/keyword-check',
      title,
      pos,
      size: [300, 130],
      properties: {
        useSemantic,
        threshold,
        presentKeywords: '',
        missingKeywords: '',
      },
      widgetsValues: [useSemantic, threshold],
    });
    if (keywords) this.link(keywords, 0, node, 0);
    if (text) this.link(text, 0, node, 1);
    return node;
  }

  /**
   * Whether an answer *means* the expected answer, as opposed to how close the
   * two sit in embedding space. See `text/semantic-equivalence` for why those
   * are different questions and why the defaults sit where they do.
   */
  semanticEquivalence(
    title: string,
    pos: [number, number],
    answer?: NodeRef,
    expected?: NodeRef,
    options: {
      lowThreshold?: number;
      highThreshold?: number;
      useEntailment?: boolean;
    } = {},
  ): NodeRef {
    const {
      lowThreshold = EQUIVALENCE_LOW_THRESHOLD,
      highThreshold = EQUIVALENCE_HIGH_THRESHOLD,
      useEntailment = true,
    } = options;
    const node = this.add({
      type: 'text/semantic-equivalence',
      title,
      pos,
      size: [340, 200],
      properties: {
        lowThreshold,
        highThreshold,
        useEntailment,
        checkNumbers: true,
        checkPolarity: true,
        similarity: 0,
        verdict: '',
      },
      widgetsValues: [lowThreshold, highThreshold, useEntailment, true, true],
    });
    if (answer) this.link(answer, 0, node, 0);
    if (expected) this.link(expected, 0, node, 1);
    return node;
  }

  sentenceTransformer(
    title: string,
    pos: [number, number],
    source?: NodeRef,
  ): NodeRef {
    const node = this.add({
      type: 'models/sentence-transformer',
      title,
      pos,
      size: [460, 60],
      properties: { value: -1 },
    });
    if (source) this.link(source, 0, node, 0);
    return node;
  }

  cosineSimilarity(
    title: string,
    pos: [number, number],
    left: NodeRef,
    right: NodeRef,
  ): NodeRef {
    const node = this.add({
      type: 'models/cosine-similarity',
      title,
      pos,
      size: [300, 80],
      properties: { value: -1 },
    });
    this.link(left, 0, node, 0);
    this.link(right, 0, node, 1);
    return node;
  }

  number(title: string, pos: [number, number], value: number): NodeRef {
    return this.add({
      type: 'basic/number',
      title,
      pos,
      size: [220, 60],
      properties: { value },
      widgetsValues: [value],
    });
  }

  sum(
    title: string,
    pos: [number, number],
    left?: NodeRef,
    right?: NodeRef,
  ): NodeRef {
    const node = this.add({
      type: 'basic/sum',
      title,
      pos,
      size: [220, 80],
      properties: { precision: 1, path: 'basic/sum' },
    });
    if (left) this.link(left, 0, node, 0);
    if (right) this.link(right, 0, node, 1);
    return node;
  }

  concatObject(
    title: string,
    pos: [number, number],
    first: NodeRef,
    second: NodeRef,
  ): NodeRef {
    const node = this.add({
      type: 'utils/concat-object',
      title,
      pos,
      size: [220, 60],
      properties: { value: [] },
    });
    this.link(first, 0, node, 0);
    this.link(second, 0, node, 1);
    return node;
  }

  stringsToArray(
    title: string,
    pos: [number, number],
    first: NodeRef,
    second?: NodeRef,
  ): NodeRef {
    const node = this.add({
      type: 'utils/strings-to-array',
      title,
      pos,
      size: [220, 60],
      properties: { value: [] },
    });
    this.link(first, 0, node, 0);
    if (second) this.link(second, 0, node, 1);
    return node;
  }

  clean(title: string, pos: [number, number], source?: NodeRef): NodeRef {
    const node = this.add({
      type: 'preprocessing/clean',
      title,
      pos,
      size: [260, 140],
      properties: {
        value: '',
        trim: true,
        space: false,
        doubleSpace: true,
        dot: false,
        comma: false,
        lower: false,
        upper: false,
        stem: false,
        removeEnclosingSpecialChars: true,
      },
      widgetsValues: [
        true,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        true,
      ],
    });
    if (source) this.link(source, 0, node, 0);
    return node;
  }

  /** System-role prompt text → message in one call. Returns the message node. */
  systemPrompt(title: string, pos: [number, number], source: NodeRef): NodeRef {
    const node = this.add({
      type: 'basic/prompt-message',
      title,
      pos,
      size: [260, 80],
      properties: { value: { role: 'system', content: '' } },
      widgetsValues: ['system'],
    });
    this.link(source, 0, node, 0);
    return node;
  }

  output(
    label: string,
    pos: [number, number],
    source: NodeRef,
    sourceSlot = 0,
    type: 'text' | 'score' | 'classifications' = 'text',
  ): NodeRef {
    const node = this.add({
      type: 'output/output',
      title: `${label} output`,
      pos,
      size: [410, 80],
      properties: { uniqueId: '', type, label, value: '' },
      widgetsValues: [label, type],
    });
    this.link(source, sourceSlot, node, 0);
    return node;
  }

  /**
   * Review flag: turns a reviewer's recommendation text (or a boolean) into the
   * structured `review` output the preview card and the Submissions inbox count
   * (SPEC-0020/FR-001, FR-003). The default markers match the two-line
   * `RECOMMENDATION:` / `REASON:` contract the bundled review prompts print.
   */
  reviewFlag(
    label: string,
    pos: [number, number],
    source: NodeRef,
    options: {
      sourceSlot?: number;
      flagPattern?: string;
      reasonPrefix?: string;
    } = {},
  ): NodeRef {
    const {
      sourceSlot = 0,
      flagPattern = DEFAULT_FLAG_PATTERN,
      reasonPrefix = DEFAULT_REASON_PREFIX,
    } = options;
    const node = this.add({
      type: 'output/review-flag',
      title: `${label} flag`,
      pos,
      size: [410, 110],
      properties: { label, flagPattern, reasonPrefix, value: '' },
      widgetsValues: [label, flagPattern, reasonPrefix],
    });
    this.link(source, sourceSlot, node, 0);
    return node;
  }

  // ---- Serialization -----------------------------------------------------------------

  build(): GraphContent {
    const nodes: GraphNode[] = this.nodes.map((pending) => {
      const table = NODE_SLOTS[pending.type];
      const inputs = table.inputs.map((input, slotIndex) => ({
        name: input.name,
        type: input.type,
        link:
          this.links.find(
            ([, , , targetId, targetSlot]) =>
              targetId === pending.id && targetSlot === slotIndex,
          )?.[0] ?? null,
      }));
      const outputs = table.outputs.map((output, slotIndex) => ({
        name: output.name,
        type: output.type,
        links: this.links
          .filter(
            ([, originId, originSlot]) =>
              originId === pending.id && originSlot === slotIndex,
          )
          .map(([id]) => id),
      }));
      const properties =
        pending.type === 'output/output'
          ? { ...pending.properties, uniqueId: String(pending.id) }
          : (pending.properties ?? {});
      return {
        id: pending.id,
        type: pending.type,
        pos: pending.pos,
        size: pending.size ?? [260, 100],
        flags: {},
        order: pending.id - 1,
        mode: 0,
        inputs,
        outputs,
        title: pending.title,
        properties,
        ...(pending.widgetsValues
          ? { widgets_values: pending.widgetsValues }
          : {}),
      };
    });
    return {
      last_node_id: this.nodes.length,
      last_link_id: this.links.length,
      nodes,
      links: this.links,
      groups: this.groups,
      config: {},
      extra: {},
      version: 0.4,
    };
  }
}
