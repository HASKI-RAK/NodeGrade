import {
  sanitizeExecutionError,
  sanitizeTraceOutputs,
  TRACE_OUTPUT_LIMIT_BYTES,
} from './trace-sanitizer.js';

describe('trace sanitization', () => {
  it('redacts credential-shaped keys and configured secret values recursively', () => {
    const [output] = sanitizeTraceOutputs(
      [
        {
          slot: 0,
          name: 'result',
          type: 'object',
          value: {
            nested: { apiKey: 'sk-live', value: 'contains super-secret here' },
            headers: { authorization: 'Bearer token' },
          },
          truncated: false,
        },
      ],
      ['super-secret'],
    );

    expect(JSON.stringify(output.value)).toContain('[REDACTED]');
    expect(JSON.stringify(output.value)).not.toContain('sk-live');
    expect(JSON.stringify(output.value)).not.toContain('super-secret');
    expect(JSON.stringify(output.value)).not.toContain('Bearer token');
  });

  it('caps serialized output at 64 KiB', () => {
    const [output] = sanitizeTraceOutputs(
      [
        {
          slot: 0,
          name: 'large',
          type: 'string',
          value: 'x'.repeat(TRACE_OUTPUT_LIMIT_BYTES * 2),
          truncated: false,
        },
      ],
      [],
    );
    expect(output.truncated).toBe(true);
    expect(Buffer.byteLength(String(output.value), 'utf8')).toBeLessThanOrEqual(
      TRACE_OUTPUT_LIMIT_BYTES,
    );
  });

  it('returns stable safe provider errors', () => {
    expect(
      sanitizeExecutionError({
        code: 'node_failed',
        message: 'Authorization: secret',
      }),
    ).toEqual({
      code: 'node_failed',
      message: 'Node execution failed.',
    });
  });
});
