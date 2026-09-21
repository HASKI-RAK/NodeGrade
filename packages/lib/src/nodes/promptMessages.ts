import type { PromptMessageType } from './types/NodeLinkMessage'

/**
 * Role a bare string is given when it arrives on a message port
 * (SPEC-0019/FR-002). The node never guesses another role: `system`,
 * `assistant` and `tool` stay the job of `basic/prompt-message` (FR-004).
 */
export const DEFAULT_PROMPT_ROLE = 'user'

/**
 * A message port carried something that cannot become a message, or the
 * prompt that would be sent is empty. Carries no node identity — the node
 * that caught it prefixes its own title, so the run error names the node
 * (SPEC-0019/FR-006).
 */
export class PromptMessageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromptMessageError'
  }
}

/**
 * Wording for the value a port delivered, for the error a participant reads.
 * Messages are phrased as predicates so the node can prefix its own title and
 * port and still read as one sentence.
 */
const describeValue = (value: unknown): string => {
  if (value === null) return 'null'
  if (value === undefined) return 'nothing'
  if (Array.isArray(value)) return 'a nested list'
  return `a ${typeof value}`
}

const isRoleObject = (value: unknown): value is { role: string; content?: unknown } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { role?: unknown }).role === 'string'

/**
 * Turns one port element into a message. A string becomes a `user` message; a
 * message object passes through by reference, so the value a shared upstream
 * node emitted is never rewritten for the next consumer of the same wire.
 * A message whose content is missing is normalised to an empty string and
 * left for `assertPromptContent` to reject like any other empty prompt.
 */
const normalizeOne = (value: unknown): PromptMessageType => {
  if (typeof value === 'string') return { role: DEFAULT_PROMPT_ROLE, content: value }
  if (isRoleObject(value)) {
    const { role, content } = value
    if (content === undefined || content === null) return { role, content: '' }
    if (typeof content !== 'string')
      throw new PromptMessageError(
        `received a message whose content is a ${typeof content}; message content must be text`
      )
    return value as PromptMessageType
  }
  throw new PromptMessageError(
    `takes text, a message, or a list of them, but received ${describeValue(value)}`
  )
}

/**
 * Normalises whatever a message port delivered into a message list
 * (SPEC-0019/FR-002, FR-003). An array is normalised element-wise with its
 * order preserved; a nested array is rejected rather than flattened.
 */
export const normalizePromptMessages = (value: unknown): PromptMessageType[] => {
  if (!Array.isArray(value)) return [normalizeOne(value)]
  return value.map((element, index) => {
    try {
      return normalizeOne(element)
    } catch (cause) {
      if (!(cause instanceof PromptMessageError)) throw cause
      // A list usually arrives from `utils/concat-object`, so say which
      // element is wrong rather than blaming the whole port.
      throw new PromptMessageError(`${cause.message} at position ${index + 1}`)
    }
  })
}

/**
 * Rejects a prompt that would reach the provider with nothing to say
 * (SPEC-0019/FR-006), before any completion request is built.
 */
export const assertPromptContent = (messages: PromptMessageType[]): void => {
  if (messages.length === 0)
    throw new PromptMessageError(
      'has no prompt content: wire text or a message into a message input'
    )
  const blank = messages.findIndex((message) => message.content.trim().length === 0)
  if (blank >= 0)
    throw new PromptMessageError(
      `would send an empty prompt: message ${blank + 1} of ${messages.length} has no content`
    )
}
