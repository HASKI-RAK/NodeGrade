export function assertIs<T>(
  value: unknown,
  typeGuard: (value: unknown) => value is T
): asserts value is T {
  if (!typeGuard(value)) {
    throw new Error('Type guard failed for value: ' + value)
  }
}
