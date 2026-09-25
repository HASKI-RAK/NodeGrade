import { expect, test } from '@playwright/test'

import {
  backendUrl,
  joinFromLandingPage,
  nodeIdByTitle,
  nodeProperty,
  saveNow,
  WAIE_WORKSHOP_CODE
} from './support/nodegrade'

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
  await expect(page.getByLabel('Editor details', { exact: true })).toHaveCount(0)
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
  await expect(page.getByLabel('Editor details', { exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'More editor actions' })).toBeInViewport()
})

test('facilitator manages template lifecycle and publication', async ({
  page
}, testInfo) => {
  const frontendOrigin = `http://localhost:${process.env.NODEGRADE_DEBUG_FRONTEND_PORT ?? '15173'}`
  const suffix = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const runId = `${Date.now()}-${testInfo.workerIndex}`
  const slug = `qa-template-${suffix}-${runId}`
  const name = `QA template ${testInfo.project.name} ${runId}`
  // There is no public gallery to look at (SPEC-0022/FR-014), so publication is read
  // from the facilitator listing with the session cookie the sign-in below sets. The
  // debug frontend is a Vite server with no /api proxy and signs in against the backend
  // under `localhost`, which is where that cookie lives.
  const adminBackend = backendUrl.replace('127.0.0.1', 'localhost')
  const publishedSlugs = async () => {
    const response = await page.request.get(`${adminBackend}/api/admin/templates`)
    const body = (await response.json()) as {
      templates: { slug: string; published: boolean }[]
    }
    return body.templates
      .filter((template) => template.published)
      .map((template) => template.slug)
  }

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
  await expect.poll(publishedSlugs).toContain(slug)

  await page.getByRole('button', { name: `Unpublish ${name}` }).click()
  await expect(page.getByRole('button', { name: `Publish ${name}` })).toBeVisible()
  await expect.poll(publishedSlugs).not.toContain(slug)

  await page.goto(`${frontendOrigin}/admin/templates`)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: `Delete ${name}` }).click()
  await expect(page.getByRole('heading', { name })).toHaveCount(0)
})
