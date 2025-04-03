export type OpenAiModel = {
  id: string
  object: string
  created: number
  owned_by: string
}

export type OpenAiApiResponse = {
  object: string
  data: OpenAiModel[]
}
