import { expect, test } from '@playwright/test'

import {
  joinFromLandingPage,
  nodeIdByTitle,
  nodeProperty,
  saveNow,
  WAIE_WORKSHOP_CODE
} from './support/nodegrade'

test('template gallery filters kinds and previews graph structure', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Templates' }).click()
  await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible()
  await expect(page.getByText('Workshop', { exact: true }).first()).toBeVisible()

  await page.getByRole('combobox', { name: 'Template type' }).click()
  await page.getByRole('option', { name: 'Blocks' }).click()
  await expect(page.getByRole('heading', { name: 'Feedback generator' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'WAIE free-text assessment' })
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Preview structure' }).first().click()
  const structure = page.getByLabel('Template structure')
  await expect(structure).toBeVisible()
  await expect(structure).toContainText(/\d+ nodes · \d+ connections/)
})

test('template-derived workflow resets to its pinned source revision', async ({
  page
}) => {
  await joinFromLandingPage(page, WAIE_WORKSHOP_CODE)
  const questionId = await nodeIdByTitle(page, 'Question')
  const original = await nodeProperty(page, questionId, 'value')
  await page.evaluate(
    (id) => window.__NODEGRADE_DEBUG__?.setNodeProperty(id, 'value', 'Changed question'),
    questionId
  )
  await saveNow(page)

  await page.getByRole('button', { name: 'More editor actions' }).click()
  await page.getByText('Reset to source template…').click()
  await expect(
    page.getByRole('heading', { name: 'Reset to source template?' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reset workflow' }).click()

  await expect.poll(() => nodeProperty(page, questionId, 'value')).toBe(original)
  await expect(
    page.getByText('Workflow reset to its source template revision.')
  ).toBeVisible()
})

test('node palette replaces details at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 493 })
  await joinFromLandingPage(page, WAIE_WORKSHOP_CODE)
  const before = await page.evaluate(() => window.__NODEGRADE_DEBUG__?.listNodes().length)

  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByLabel('Editor details')).toHaveCount(0)
  const palette = page.getByLabel('Node palette')
  await expect(palette).toBeVisible()
  await palette.getByRole('textbox', { name: 'Search nodes' }).fill('Question')
  await palette.getByRole('button', { name: 'Question' }).click()

  await expect
    .poll(() => page.evaluate(() => window.__NODEGRADE_DEBUG__?.listNodes().length))
    .toBe((before ?? 0) + 1)
})

test('node palette keeps desktop editor controls within the viewport', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await joinFromLandingPage(page, WAIE_WORKSHOP_CODE)

  await page.getByRole('button', { name: 'Add' }).click()

  await expect(page.getByLabel('Node palette')).toBeVisible()
  await expect(page.getByLabel('Editor details')).toBeInViewport()
  await expect(page.getByRole('button', { name: 'More editor actions' })).toBeInViewport()
})

test('facilitator manages template lifecycle and gallery visibility', async ({
  page
}, testInfo) => {
  const frontendOrigin = `http://localhost:${process.env.NODEGRADE_DEBUG_FRONTEND_PORT ?? '15173'}`
  const suffix = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const runId = `${Date.now()}-${testInfo.workerIndex}`
  const slug = `qa-template-${suffix}-${runId}`
  const name = `QA template ${testInfo.project.name} ${runId}`

  await page.goto(`${frontendOrigin}/admin/templates`)
  await page.getByRole('textbox', { name: 'Username' }).fill('debug-admin')
  await page.getByRole('textbox', { name: 'Password' }).fill('debug-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    page.getByRole('heading', { name: 'Template administration' })
  ).toBeVisible()

  await page.getByRole('textbox', { name: 'Name' }).fill(name)
  await page.getByRole('textbox', { name: 'Slug' }).fill(slug)
  await page.getByRole('textbox', { name: 'Category' }).fill('QA')
  await page.getByRole('button', { name: 'Create template' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  await page.getByRole('button', { name: `Add revision to ${name}` }).click()
  await page.getByRole('button', { name: 'Create revision' }).click()
  await expect(page.getByText(`${slug} · revision 2`)).toBeVisible()

  await page.getByRole('button', { name: `Publish ${name}` }).click()
  await expect(page.getByRole('button', { name: `Unpublish ${name}` })).toBeVisible()
  await page.goto(`${frontendOrigin}/templates`)
  await expect(page.getByRole('heading', { name })).toBeVisible()

  await page.goto(`${frontendOrigin}/admin/templates`)
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await page.getByRole('button', { name: `Unpublish ${name}` }).click()
  await page.goto(`${frontendOrigin}/templates`)
  await expect(page.getByRole('heading', { name })).toHaveCount(0)

  await page.goto(`${frontendOrigin}/admin/templates`)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(page.getByRole('heading', { name })).toHaveCount(0)
})
