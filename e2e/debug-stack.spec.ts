import { expect, test } from '@playwright/test'

type DebugBridge = {
  version: 2
  listNodes(): Array<{
    id: number
    title: string
    type: string
    properties: Record<string, unknown>
  }>
  setNodeProperty(id: number, property: string, value: unknown): boolean
  selectedNodeIds(): number[]
  socketState(): { connected: boolean }
  workspaceState(): { workspaceId?: string; workflowId?: string; type?: string }
  saveStatus(): string
  saveNow(): Promise<string>
  waitForEvent(eventName: string, timeoutMs?: number): Promise<unknown>
  runGraph(answer?: string): boolean
}

declare global {
  interface Window {
    __NODEGRADE_DEBUG__?: DebugBridge
  }
}

const modelUrl = `http://127.0.0.1:${process.env.NODEGRADE_DEBUG_MODEL_PORT ?? '18000'}`

const joinWorkshop = async (page: import('@playwright/test').Page) => {
  await page.goto('/workshop/WAVE-2026')
  await page.waitForURL(/\/editor\//)
  await page.waitForFunction(() => window.__NODEGRADE_DEBUG__?.version === 2)
  await expect(page.locator('#mycanvas')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.__NODEGRADE_DEBUG__?.socketState().connected))
    .toBe(true)
}

test('deterministic model exposes OpenAI-compatible contract', async ({ request }) => {
  const models = await request.get(`${modelUrl}/v1/models`)
  await expect(models).toBeOK()
  await expect(models.json()).resolves.toMatchObject({
    object: 'list',
    data: [{ id: 'nodegrade-deterministic' }]
  })

  const completion = await request.post(`${modelUrl}/v1/chat/completions`, {
    data: {
      model: 'nodegrade-deterministic',
      messages: [{ role: 'user', content: 'Deterministic check' }]
    }
  })
  await expect(completion).toBeOK()
  await expect(completion.json()).resolves.toMatchObject({
    created: expect.any(Number),
    choices: [
      expect.objectContaining({
        message: expect.objectContaining({ role: 'assistant' })
      })
    ],
    usage: {
      prompt_tokens: expect.any(Number),
      completion_tokens: expect.any(Number),
      total_tokens: expect.any(Number)
    }
  })
})

test('workshop workflow autosaves and executes', async ({ page }) => {
  await joinWorkshop(page)
  const nodes = await page.evaluate(() => window.__NODEGRADE_DEBUG__?.listNodes())
  expect(nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ title: 'Question' }),
      expect.objectContaining({ title: 'Answer Input' })
    ])
  )
  const first = nodes?.[0]
  expect(first).toBeDefined()
  await page.evaluate(
    (id) => window.__NODEGRADE_DEBUG__?.setNodeProperty(id, 'wave1Marker', 'persisted'),
    first?.id
  )
  await expect
    .poll(() => page.evaluate(() => window.__NODEGRADE_DEBUG__?.saveStatus()))
    .toBe('dirty')
  await expect(page.evaluate(() => window.__NODEGRADE_DEBUG__?.saveNow())).resolves.toBe(
    'saved'
  )
  await page.getByRole('button', { name: 'Preview' }).click()
  await page.getByLabel('Antwort').fill('Playwright deterministic answer')
  await page.getByRole('button', { name: 'Absenden' }).click()
  await page.evaluate(() => window.__NODEGRADE_DEBUG__?.waitForEvent('graphFinished'))
  await expect(page.getByText('Run: completed')).toBeVisible()
  const traceSteps = page.locator('[aria-label^="Select "]')
  await expect(traceSteps).toHaveCount(3)
  await expect(page.locator('[aria-label="Run trace"] pre').first()).toBeVisible()
  await traceSteps.first().click()
  await expect
    .poll(() => page.evaluate(() => window.__NODEGRADE_DEBUG__?.selectedNodeIds()))
    .toContain(first?.id)
  await page.reload()
  await page.waitForFunction(() => window.__NODEGRADE_DEBUG__?.version === 2)
  const reloaded = await page.evaluate(() => window.__NODEGRADE_DEBUG__?.listNodes())
  expect(reloaded?.find((node) => node.id === first?.id)?.properties.wave1Marker).toBe(
    'persisted'
  )
})

test('two participants joining one code receive isolated workspaces', async ({
  browser
}) => {
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const first = await firstContext.newPage()
  const second = await secondContext.newPage()
  await Promise.all([joinWorkshop(first), joinWorkshop(second)])
  const [firstState, secondState] = await Promise.all([
    first.evaluate(() => window.__NODEGRADE_DEBUG__?.workspaceState()),
    second.evaluate(() => window.__NODEGRADE_DEBUG__?.workspaceState())
  ])
  expect(firstState?.type).toBe('WORKSHOP')
  expect(secondState?.type).toBe('WORKSHOP')
  expect(firstState?.workspaceId).toBeTruthy()
  expect(secondState?.workspaceId).toBeTruthy()
  expect(firstState?.workspaceId).not.toBe(secondState?.workspaceId)
  expect(firstState?.workflowId).not.toBe(secondState?.workflowId)
  await firstContext.close()
  await secondContext.close()
})
