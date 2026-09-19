import { expect, test } from '@playwright/test'

import {
  backendUrl,
  DETERMINISTIC_MODEL_ID,
  DETERMINISTIC_PROVIDER_KEY,
  inspectNode,
  joinFromLandingPage,
  nodeIdByTitle,
  nodeIdsByType,
  nodeProperty,
  saveNow,
  WAIE_WORKSHOP_CODE,
  waitForEditor
} from './support/nodegrade'

/**
 * The conference happy path, protected on every pull request (SPEC-0008/FR-002, AC-002).
 *
 * It walks what a workshop actually does, in order: open the application root, enter the
 * handout code, receive a private copy of the WAIE template, change the rubric, run an
 * example answer, read the result, reload, and find the work still there. Every model call
 * goes to the deterministic worker, so the assertions are about NodeGrade rather than
 * about what a language model felt like saying (FR-006).
 */

const EDITED_RUBRIC = [
  'You grade short free-text answers for a teacher.',
  '',
  'Rubric (100 points):',
  '- 100 points: mentions photosynthesis at all.',
  '',
  'End your reply with a single line in the form: Score: <number between 0 and 100>'
].join('\n')

const ANSWER =
  'Plants use light, water and carbon dioxide to make glucose and release oxygen, which other organisms breathe.'

test('the deployment offers only the deterministic provider', async ({ request }) => {
  const response = await request.get(`${backendUrl}/api/models`)
  await expect(response).toBeOK()
  const catalog = (await response.json()) as {
    models: { ref: { providerKey: string; modelId: string } }[]
    providers: { providerKey: string; status: string }[]
  }
  expect(catalog.models.length).toBeGreaterThan(0)
  // Nothing a participant can pick may reach a cloud provider, so a smoke test cannot
  // spend a credential or depend on a third party being up (FR-006, AC-006).
  expect(
    catalog.models.every((model) => model.ref.providerKey === DETERMINISTIC_PROVIDER_KEY)
  ).toBe(true)
  expect(
    catalog.providers
      .filter((provider) => provider.status === 'AVAILABLE')
      .map((provider) => provider.providerKey)
  ).toEqual([DETERMINISTIC_PROVIDER_KEY])
})

test('a participant joins the WAIE workshop, edits the rubric, runs it and reloads', async ({
  page
}) => {
  await joinFromLandingPage(page, WAIE_WORKSHOP_CODE)

  // Joining duplicated the published template revision into this browser's own workspace.
  await expect(page.getByText('WAIE free-text assessment')).toBeVisible()
  const rubricId = await nodeIdByTitle(page, 'Rubric')
  const modelNodeIds = await nodeIdsByType(page, 'models/llm')
  expect(modelNodeIds).toHaveLength(3)

  // Debug seeding maps the production OpenRouter default to the deterministic local
  // provider, preserving the configured-workflow path without external traffic.
  for (const id of modelNodeIds) {
    await expect
      .poll(() => nodeProperty(page, id, 'model_ref'))
      .toEqual({
        providerKey: DETERMINISTIC_PROVIDER_KEY,
        modelId: DETERMINISTIC_MODEL_ID
      })
  }

  await inspectNode(page, rubricId)
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill(EDITED_RUBRIC)
  await expect.poll(() => nodeProperty(page, rubricId, 'value')).toBe(EDITED_RUBRIC)
  await saveNow(page)

  await page.getByRole('button', { name: 'Preview' }).click()
  await page.getByRole('textbox', { name: 'Your answer' }).fill(ANSWER)
  await page.getByRole('button', { name: 'Run assessment' }).click()
  await page.evaluate(() =>
    window.__NODEGRADE_DEBUG__?.waitForEvent('graphFinished', 60_000)
  )
  // Runs stay on the Test tab with inline progress; the trace is one click away.
  await page.getByRole('tab', { name: 'Trace' }).click()
  await expect(page.getByText('Run: completed')).toBeVisible()

  await page.getByRole('tab', { name: 'Test' }).click()
  const results = page.getByLabel('Results')
  // Each output lands on its own card, titled by the output node's label.
  const scoreCard = results.getByRole('article', { name: 'Score' })
  await expect(scoreCard.getByText('100', { exact: true })).toBeVisible()
  await expect(scoreCard.getByText('Passed', { exact: true })).toBeVisible()
  await expect(results.getByRole('article', { name: 'Classification' })).toBeVisible()
  const feedbackCard = results.getByRole('article', { name: 'Feedback' })
  await expect(feedbackCard.getByText(/Deterministic debug response/)).toBeVisible()
  // The facilitator can jump from a card to the node that produced it.
  await expect(
    results.getByRole('button', { name: 'Locate Feedback on the canvas' })
  ).toBeVisible()

  await page.reload()
  await waitForEditor(page)
  await expect(page.getByText('WAIE free-text assessment')).toBeVisible()
  expect(await nodeProperty(page, rubricId, 'value')).toBe(EDITED_RUBRIC)
  expect(await nodeProperty(page, modelNodeIds[0], 'model_ref')).toEqual({
    providerKey: DETERMINISTIC_PROVIDER_KEY,
    modelId: DETERMINISTIC_MODEL_ID
  })
})
