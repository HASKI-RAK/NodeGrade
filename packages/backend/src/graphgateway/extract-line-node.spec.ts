import { ExtractLineNode, extractLine } from '@haski/ta-lib';

const DIAGNOSIS = [
  'CATEGORY: MISCONCEPTION',
  'EVIDENCE: "four is more than two"',
  'REASON: Confuses the number of pieces with their size.',
  'REVIEW: NO',
].join('\n');

describe('extractLine', () => {
  it('lifts the line after the prefix, without the prefix', () => {
    expect(extractLine(DIAGNOSIS, 'CATEGORY:')).toBe('MISCONCEPTION');
    expect(extractLine(DIAGNOSIS, 'REVIEW:')).toBe('NO');
  });

  it('matches the prefix case-insensitively and trims around it', () => {
    expect(
      extractLine('  category:  correct  \nREASON: fine', ' Category: '),
    ).toBe('correct');
  });

  it('takes the first matching line when several qualify', () => {
    expect(extractLine('KEY: first\nKEY: second', 'KEY:')).toBe('first');
  });

  it('returns the first non-empty line for an empty prefix', () => {
    expect(extractLine('\n\n  MISCONCEPTION \nmore', '')).toBe('MISCONCEPTION');
  });

  it('returns an empty string when nothing matches or nothing arrived', () => {
    expect(extractLine('no structure here', 'CATEGORY:')).toBe('');
    expect(extractLine(null, 'CATEGORY:')).toBe('');
    expect(extractLine(undefined, 'CATEGORY:')).toBe('');
  });

  it('handles CRLF replies', () => {
    expect(extractLine('CATEGORY: CORRECT\r\nREASON: ok', 'CATEGORY:')).toBe(
      'CORRECT',
    );
  });
});

describe('ExtractLineNode', () => {
  it('declares a string in, a string out and the category prefix by default', () => {
    const node = new ExtractLineNode();
    expect(node.inputs[0].type).toBe('string');
    expect(node.outputs[0].type).toBe('string');
    expect(node.properties.prefix).toBe('CATEGORY:');
    expect(ExtractLineNode.getPath()).toBe('text/extract-line');
  });

  it('publishes the extracted line on its output and in its value', async () => {
    const node = new ExtractLineNode();
    node.getInputData = jest.fn(() => DIAGNOSIS) as typeof node.getInputData;
    const setOutputData = jest.spyOn(node, 'setOutputData');

    await node.onExecute();

    expect(setOutputData).toHaveBeenCalledWith(0, 'MISCONCEPTION');
    expect(node.properties.value).toBe('MISCONCEPTION');
  });
});
