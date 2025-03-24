import { ClientBenchmarkPostPayload } from '@haski/ta-lib'

export const isPayloadClientBenchmarkValid = (
  payload: unknown
): payload is ClientBenchmarkPostPayload => {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'client_id' in payload &&
    'benchmark_id' in payload &&
    'benchmark_value' in payload
  )
}
export const isClientBenchmarkPostPayload = (
  payload: unknown
): payload is ClientBenchmarkPostPayload => {
  if (typeof payload !== 'object' || payload === null) {
    return false
  }

  const p = payload as { [key: string]: unknown }

  return (
    'path' in p &&
    typeof p.path === 'string' &&
    'data' in p &&
    typeof p.data === 'object' &&
    p.data !== null &&
    'question' in p.data &&
    typeof p.data.question === 'string' &&
    'realAnswer' in p.data &&
    typeof p.data.realAnswer === 'string' &&
    'answer' in p.data &&
    typeof p.data.answer === 'string'
  )
}
