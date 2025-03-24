import {
  isClientBenchmarkPostPayload,
  isPayloadClientBenchmarkValid
} from '../../src/utils/typeGuards'

describe('Type Guards', () => {
  describe('isPayloadClientBenchmarkValid', () => {
    it('should return true for a valid client benchmark payload', () => {
      const validPayload = {
        client_id: 'test-client',
        benchmark_id: 'test-benchmark',
        benchmark_value: 0.85
      }

      expect(isPayloadClientBenchmarkValid(validPayload)).toBe(true)
    })

    it('should return false for an invalid client benchmark payload', () => {
      // Null payload
      expect(isPayloadClientBenchmarkValid(null)).toBe(false)

      // Not an object
      expect(isPayloadClientBenchmarkValid('string')).toBe(false)

      // Missing client_id
      expect(
        isPayloadClientBenchmarkValid({
          benchmark_id: 'test-benchmark',
          benchmark_value: 0.85
        })
      ).toBe(false)

      // Missing benchmark_id
      expect(
        isPayloadClientBenchmarkValid({
          client_id: 'test-client',
          benchmark_value: 0.85
        })
      ).toBe(false)

      // Missing benchmark_value
      expect(
        isPayloadClientBenchmarkValid({
          client_id: 'test-client',
          benchmark_id: 'test-benchmark'
        })
      ).toBe(false)
    })
  })

  describe('isClientBenchmarkPostPayload', () => {
    it('should return true for a valid client benchmark post payload', () => {
      const validPayload = {
        path: '/test/path',
        data: {
          question: 'Test question?',
          realAnswer: 'Real answer',
          answer: 'User answer'
        }
      }

      expect(isClientBenchmarkPostPayload(validPayload)).toBe(true)
    })

    it('should return false for an invalid client benchmark post payload', () => {
      // Null payload
      expect(isClientBenchmarkPostPayload(null)).toBe(false)

      // Not an object
      expect(isClientBenchmarkPostPayload('string')).toBe(false)

      // Missing path
      expect(
        isClientBenchmarkPostPayload({
          data: {
            question: 'Test question?',
            realAnswer: 'Real answer',
            answer: 'User answer'
          }
        })
      ).toBe(false)

      // Path is not a string
      expect(
        isClientBenchmarkPostPayload({
          path: 123,
          data: {
            question: 'Test question?',
            realAnswer: 'Real answer',
            answer: 'User answer'
          }
        })
      ).toBe(false)

      // Missing data
      expect(
        isClientBenchmarkPostPayload({
          path: '/test/path'
        })
      ).toBe(false)

      // Data is not an object
      expect(
        isClientBenchmarkPostPayload({
          path: '/test/path',
          data: 'not an object'
        })
      ).toBe(false)

      // Missing question in data
      expect(
        isClientBenchmarkPostPayload({
          path: '/test/path',
          data: {
            realAnswer: 'Real answer',
            answer: 'User answer'
          }
        })
      ).toBe(false)

      // Missing realAnswer in data
      expect(
        isClientBenchmarkPostPayload({
          path: '/test/path',
          data: {
            question: 'Test question?',
            answer: 'User answer'
          }
        })
      ).toBe(false)

      // Missing answer in data
      expect(
        isClientBenchmarkPostPayload({
          path: '/test/path',
          data: {
            question: 'Test question?',
            realAnswer: 'Real answer'
          }
        })
      ).toBe(false)
    })
  })
})
