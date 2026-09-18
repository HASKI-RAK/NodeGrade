import { expect, test } from '@playwright/test'

import {
  DETERMINISTIC_MODEL_ID,
  joinWorkshop,
  modelUrl,
  saveNow,
  selectedNodeIds
} from './support/nodegrade'

test('deterministic model exposes OpenAI-compatible contract', async ({ request }) => {
  const models = await request.get(`${modelUrl}/v1/models`)
  await expect(models).toBeOK()
  await expect(models.json()).resolves.toMatchObject({
    object: 'list',
    data: [{ id: DETERMINISTIC_MODEL_ID }]
  })

  const completion = await request.post(`${modelUrl}/v1/chat/completions`, {
    data: {
      model: DETERMINISTIC_MODEL_ID,
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
  const firstId = first!.id
  await page.evaluate(
    (id) => window.__NODEGRADE_DEBUG__?.setNodeProperty(id, 'wave1Marker', 'persisted'),
    firstId
  )
  await expect
    .poll(() => page.evaluate(() => window.__NODEGRADE_DEBUG__?.saveStatus()))
    .toBe('dirty')
  await saveNow(page)
  await page.getByRole('button', { name: 'Preview' }).click()
  await page.getByLabel('Your answer').fill('Playwright deterministic answer')
  await page.getByRole('button', { name: 'Run assessment' }).click()
  await page.evaluate(() => window.__NODEGRADE_DEBUG__?.waitForEvent('graphFinished'))
  await expect(page.getByText('Run: completed')).toBeVisible()
  const traceSteps = page.getByRole('button', { name: /^Toggle / })
  await expect(traceSteps).toHaveCount(3)
  await traceSteps.first().click()
  await expect(page.locator('[aria-label="Run trace"] pre').first()).toBeVisible()
  await page.getByRole('button', { name: /^Select / }).first().click()
  await expect.poll(() => selectedNodeIds(page)).toContain(firstId)
  await page.reload()
  await page.waitForFunction(() => window.__NODEGRADE_DEBUG__?.version === 2)
  const reloaded = await page.evaluate(() => window.__NODEGRADE_DEBUG__?.listNodes())
  expect(reloaded?.find((node) => node.id === firstId)?.properties.wave1Marker).toBe(
    'persisted'
  )
})
