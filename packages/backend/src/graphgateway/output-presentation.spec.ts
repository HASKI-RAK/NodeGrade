import {
  DEFAULT_TONE_MAP,
  explainEquivalence,
  type EquivalenceReason,
  KeywordCheckNode,
  OutputNode,
  parseReport,
  parseToneMap,
  reportHeadline,
  ReviewFlagNode,
  toneFor,
} from '@haski/ta-lib';

const ASSESSMENT_REPLY = [
  'JUDGMENT: INCOMPLETE',
  'EVIDENCE: because the earth rotates',
  'REASON: The answer supports that Earth turns but does not explain the lit',
  'and dark sides.',
  'NEXT STEP: What happens to the side facing the Sun?',
].join('\n');

const GRADER_REPLY = [
  '1',
  'CRITERION: Evaporation',
  'EVIDENCE: water goes up',
  'GAP: does not say liquid water becomes vapor.',
].join('\n');

describe('parseToneMap / toneFor', () => {
  it('reads TOKEN=tone entries and ignores entries with an unknown tone', () => {
    expect(parseToneMap('CORRECT=success, wrong=error, ODD=purple')).toEqual({
      CORRECT: 'success',
      WRONG: 'error',
    });
  });

  it('normalises spaces, dashes and case so prompt wording still matches', () => {
    expect(toneFor('too vague or irrelevant', DEFAULT_TONE_MAP)).toBe('neutral');
    expect(toneFor('Keep-as-draft', DEFAULT_TONE_MAP)).toBe('success');
    expect(toneFor('MISCONCEPTION', DEFAULT_TONE_MAP)).toBe('error');
  });

  it('maps booleans through TRUE and FALSE', () => {
    expect(toneFor(true, DEFAULT_TONE_MAP)).toBe('success');
    expect(toneFor(false, DEFAULT_TONE_MAP)).toBe('error');
    expect(toneFor(false, 'FALSE=neutral')).toBe('neutral');
  });

  it('answers nothing for an unmapped value', () => {
    expect(toneFor('SOMETHING_ELSE', DEFAULT_TONE_MAP)).toBeUndefined();
    expect(toneFor('CORRECT', '')).toBeUndefined();
  });
});

describe('parseReport / reportHeadline', () => {
  it('splits KEY: value lines and keeps a wrapped value on its entry', () => {
    const report = parseReport(ASSESSMENT_REPLY);
    expect(report.points).toBeUndefined();
    expect(report.entries).toEqual([
      { key: 'JUDGMENT', value: 'INCOMPLETE' },
      { key: 'EVIDENCE', value: 'because the earth rotates' },
      {
        key: 'REASON',
        value:
          'The answer supports that Earth turns but does not explain the lit\nand dark sides.',
      },
      { key: 'NEXT STEP', value: 'What happens to the side facing the Sun?' },
    ]);
    expect(report.prose).toEqual([]);
  });

  it('lifts a bare number on the first line as the awarded points', () => {
    const report = parseReport(GRADER_REPLY);
    expect(report.points).toBe(1);
    expect(report.entries.map((entry) => entry.key)).toEqual([
      'CRITERION',
      'EVIDENCE',
      'GAP',
    ]);
  });

  it('keeps text without keys as prose and treats lower-case colons as prose', () => {
    const report = parseReport('Well done.\nNote: keep going.');
    expect(report.entries).toEqual([]);
    expect(report.prose).toEqual(['Well done.', 'Note: keep going.']);
    expect(parseReport(null)).toEqual({ entries: [], prose: [] });
  });

  it('promotes the configured line, or the first one, and never the wrong one', () => {
    const report = parseReport(ASSESSMENT_REPLY);
    expect(reportHeadline(report, 'JUDGMENT')?.value).toBe('INCOMPLETE');
    expect(reportHeadline(report, 'judgment:')?.value).toBe('INCOMPLETE');
    expect(reportHeadline(report, undefined)?.key).toBe('JUDGMENT');
    expect(reportHeadline(report, 'CATEGORY')).toBeUndefined();
  });
});

describe('explainEquivalence', () => {
  it('has a sentence for every stage', () => {
    const reasons: EquivalenceReason[] = [
      'exact',
      'number-match',
      'number-mismatch',
      'polarity-match',
      'polarity-mismatch',
      'cosine-low',
      'cosine-only',
      'nli-entailment',
      'nli-contradiction',
      'nli-neutral',
      'nli-unavailable',
      'empty-input',
    ];
    for (const reason of reasons) {
      expect(explainEquivalence(reason, false)).toMatch(/\.$/);
      expect(explainEquivalence(reason, true)).toMatch(/\.$/);
    }
    expect(explainEquivalence('nli-neutral', false)).not.toBe(
      explainEquivalence('nli-neutral', true),
    );
  });
});

describe('KeywordCheckNode checklist output', () => {
  it('emits one ticked or crossed item per keyword, in the given order', async () => {
    const node = new KeywordCheckNode();
    node.getInputData = jest.fn((slot: number) =>
      slot === 0 ? 'rotation, axis, sunlight' : 'The Earth spins on its axis.',
    ) as typeof node.getInputData;
    const setOutputData = jest.fn();
    node.setOutputData = setOutputData as typeof node.setOutputData;
    await node.onExecute();
    expect(setOutputData).toHaveBeenCalledWith(0, 'axis');
    expect(setOutputData).toHaveBeenCalledWith(1, 'rotation, sunlight');
    expect(setOutputData).toHaveBeenCalledWith(2, [
      { label: 'rotation', ok: false },
      { label: 'axis', ok: true },
      { label: 'sunlight', ok: false },
    ]);
  });

  it('has the checklist port, also after configuring a two-port graph', () => {
    const node = new KeywordCheckNode();
    expect(node.outputs.map((output) => output.name)).toEqual([
      'present keywords',
      'missing keywords',
      'checklist',
    ]);
    node.outputs = node.outputs.slice(0, 2);
    node.onConfigure({});
    expect(node.outputs).toHaveLength(3);
  });
});

describe('OutputNode presentation', () => {
  it('sends the value, the detail line and the non-default presentation', async () => {
    const node = new OutputNode();
    expect(node.inputs.map((input) => input.name)).toEqual(['value', 'detail']);
    node.properties.type = 'verdict';
    node.properties.label = 'Means the same';
    node.properties.section = 'D';
    node.properties.audience = 'educator';
    node.properties.max = 8;
    node.properties.passMark = 0;
    node.getInputData = jest.fn((slot: number) =>
      slot === 0 ? false : 'The entailment model found a contradiction.',
    ) as typeof node.getInputData;
    const emit = jest.fn();
    node.emitEventCallback = emit;
    await node.onExecute();
    expect(emit).toHaveBeenCalledWith({
      eventName: 'outputSet',
      payload: expect.objectContaining({
        type: 'verdict',
        label: 'Means the same',
        value: false,
        detail: 'The entailment model found a contradiction.',
        section: 'D',
        audience: 'educator',
        toneMap: DEFAULT_TONE_MAP,
        max: 8,
        passMark: 0,
      }),
    });
    const payload = emit.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('statusKey');
  });

  it('leaves defaults out of the payload and restores the detail port on load', async () => {
    const node = new OutputNode();
    node.getInputData = jest.fn(() => 'Some feedback.') as typeof node.getInputData;
    const emit = jest.fn();
    node.emitEventCallback = emit;
    node.inputs = node.inputs.slice(0, 1);
    node.onConfigure({});
    expect(node.inputs).toHaveLength(2);
    await node.onExecute();
    const payload = emit.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        type: 'text',
        value: 'Some feedback.',
        passMark: 60,
      }),
    );
    expect(payload).not.toHaveProperty('audience');
    expect(payload).not.toHaveProperty('section');
    expect(payload).not.toHaveProperty('max');
  });
});

describe('ReviewFlagNode reason only when flagged', () => {
  const feed = (node: ReviewFlagNode, value: string) => {
    node.getInputData = jest.fn(() => value) as typeof node.getInputData;
    node.setOutputData = jest.fn() as typeof node.setOutputData;
    const emit = jest.fn();
    node.emitEventCallback = emit;
    return emit;
  };

  it('drops the reason on a clear run when the toggle is on', async () => {
    const node = new ReviewFlagNode();
    node.properties.flagPattern = 'JUDGMENT: UNCLEAR';
    node.properties.reasonOnlyWhenFlagged = true;
    node.properties.audience = 'educator';
    node.properties.section = 'C';
    const emit = feed(node, ASSESSMENT_REPLY);
    await node.onExecute();
    expect(emit).toHaveBeenCalledWith({
      eventName: 'outputSet',
      payload: expect.objectContaining({
        type: 'review',
        verdict: 'clear',
        value: '',
        audience: 'educator',
        section: 'C',
      }),
    });
  });

  it('keeps the reason on a flagged run and, by default, on a clear one', async () => {
    const flaggedNode = new ReviewFlagNode();
    flaggedNode.properties.flagPattern = 'JUDGMENT: INCOMPLETE';
    flaggedNode.properties.reasonOnlyWhenFlagged = true;
    const flagged = feed(flaggedNode, ASSESSMENT_REPLY);
    await flaggedNode.onExecute();
    expect(flagged.mock.calls[0][0].payload).toEqual(
      expect.objectContaining({
        verdict: 'flagged',
        value: expect.stringContaining('The answer supports that Earth turns'),
      }),
    );

    const clearNode = new ReviewFlagNode();
    clearNode.properties.flagPattern = 'JUDGMENT: UNCLEAR';
    const clear = feed(clearNode, ASSESSMENT_REPLY);
    await clearNode.onExecute();
    const payload = clear.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.verdict).toBe('clear');
    expect(String(payload.value)).toContain('The answer supports that Earth turns');
    expect(payload).not.toHaveProperty('audience');
  });
});
