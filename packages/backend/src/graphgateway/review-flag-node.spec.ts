import { evaluateReviewSignal, ReviewFlagNode } from '@haski/ta-lib';

const feed = (node: ReviewFlagNode, value: unknown): void => {
  node.isInputConnected = jest.fn(() => true);
  node.getInputData = jest.fn(() => value) as typeof node.getInputData;
};

const REVIEW_REPLY = [
  'RECOMMENDATION: EDUCATOR_REVIEW',
  'REASON: The category is not supported by the student answer.',
].join('\n');

describe('evaluateReviewSignal', () => {
  const defaults = { flagPattern: 'EDUCATOR_REVIEW', reasonPrefix: 'REASON:' };

  it('flags text carrying the marker and lifts the reason line', () => {
    expect(evaluateReviewSignal(REVIEW_REPLY, defaults)).toEqual({
      flagged: true,
      reason: 'The category is not supported by the student answer.',
    });
  });

  it('keeps a clear verdict readable through its reason line', () => {
    const reply = 'RECOMMENDATION: KEEP_AS_DRAFT\nREASON: Evidence quoted verbatim.';
    expect(evaluateReviewSignal(reply, defaults)).toEqual({
      flagged: false,
      reason: 'Evidence quoted verbatim.',
    });
  });

  it('matches any comma-separated marker, case-insensitively', () => {
    const options = { ...defaults, flagPattern: 'judgment: unclear, CONTRADICTORY' };
    expect(evaluateReviewSignal('JUDGMENT: UNCLEAR\nREASON: vague', options).flagged).toBe(
      true,
    );
    expect(
      evaluateReviewSignal('Category: contradictory claims', options).flagged,
    ).toBe(true);
    expect(evaluateReviewSignal('JUDGMENT: CORRECT', options).flagged).toBe(false);
  });

  it('passes text without a reason line through whole', () => {
    expect(evaluateReviewSignal('  no structure here  ', defaults)).toEqual({
      flagged: false,
      reason: 'no structure here',
    });
  });

  it('treats a boolean as the verdict and everything absent as clear', () => {
    expect(evaluateReviewSignal(true, defaults)).toEqual({ flagged: true, reason: '' });
    expect(evaluateReviewSignal(false, defaults)).toEqual({ flagged: false, reason: '' });
    expect(evaluateReviewSignal(null, defaults)).toEqual({ flagged: false, reason: '' });
    expect(evaluateReviewSignal(undefined, defaults)).toEqual({
      flagged: false,
      reason: '',
    });
  });

  it('never flags on an empty marker list', () => {
    expect(
      evaluateReviewSignal(REVIEW_REPLY, { ...defaults, flagPattern: ' , ' }).flagged,
    ).toBe(false);
  });
});

describe('ReviewFlagNode', () => {
  it('declares a string-or-boolean signal port and a boolean flagged port', () => {
    const node = new ReviewFlagNode();
    expect(node.inputs[0].type).toBe('string,boolean');
    expect(node.outputs[0].type).toBe('boolean');
    expect(ReviewFlagNode.getPath()).toBe('output/review-flag');
  });

  it('emits a review output with the verdict and sets its boolean output', async () => {
    const node = new ReviewFlagNode();
    node.properties.label = 'Needs a tutor?';
    feed(node, REVIEW_REPLY);
    const emitted: unknown[] = [];
    node.emitEventCallback = (event) => emitted.push(event);
    const setOutputData = jest.spyOn(node, 'setOutputData');

    await node.onExecute();

    expect(setOutputData).toHaveBeenCalledWith(0, true);
    expect(node.properties.value).toBe(
      'The category is not supported by the student answer.',
    );
    expect(emitted).toEqual([
      {
        eventName: 'outputSet',
        payload: {
          uniqueId: node.id.toString(),
          type: 'review',
          verdict: 'flagged',
          label: 'Needs a tutor?',
          value: 'The category is not supported by the student answer.',
        },
      },
    ]);
  });

  it('reports clear when the marker is absent', async () => {
    const node = new ReviewFlagNode();
    feed(node, 'RECOMMENDATION: KEEP_AS_DRAFT\nREASON: Nothing wrong.');
    const emitted: { payload: unknown }[] = [];
    node.emitEventCallback = (event) => emitted.push(event);

    await node.onExecute();

    expect(emitted[0].payload).toEqual(
      expect.objectContaining({ verdict: 'clear', value: 'Nothing wrong.' }),
    );
  });
});
