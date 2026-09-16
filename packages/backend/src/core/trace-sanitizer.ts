import { TraceError, TraceOutput } from '@haski/ta-lib';

export const TRACE_OUTPUT_LIMIT_BYTES = 64 * 1024;
const REDACTED = '[REDACTED]';
const SECRET_KEY =
  /(authorization|api[_-]?key|token|secret|password|cookie|headers?|account|organization|project)/i;

const redact = (
  value: unknown,
  secrets: string[],
  seen: WeakSet<object>,
  key?: string,
): unknown => {
  if (key && SECRET_KEY.test(key)) return REDACTED;
  if (typeof value === 'string') {
    return secrets.reduce(
      (safe, secret) =>
        secret.length >= 4 ? safe.split(secret).join(REDACTED) : safe,
      value,
    );
  }
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value))
    return value.map((item) => redact(item, secrets, seen));
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redact(entryValue, secrets, seen, entryKey),
      ]),
    );
  }
  return value;
};

export const sanitizeTraceOutputs = (
  outputs: TraceOutput[],
  configuredSecrets: Array<string | undefined>,
): TraceOutput[] => {
  const secrets = configuredSecrets.filter((value): value is string =>
    Boolean(value),
  );
  return outputs.map((output) => {
    const value = redact(output.value, secrets, new WeakSet());
    const serialized = JSON.stringify(value) ?? String(value);
    if (Buffer.byteLength(serialized, 'utf8') <= TRACE_OUTPUT_LIMIT_BYTES) {
      return { ...output, value, truncated: false };
    }
    const capped = Buffer.from(serialized, 'utf8')
      .subarray(0, TRACE_OUTPUT_LIMIT_BYTES)
      .toString('utf8');
    return { ...output, value: capped, truncated: true };
  });
};

export const sanitizeExecutionError = (error: TraceError): TraceError => ({
  code: error.code,
  message:
    error.code === 'timeout'
      ? 'Node execution timed out.'
      : error.code === 'cancelled'
        ? 'Run cancelled.'
        : 'Node execution failed.',
});
