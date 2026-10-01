import { expect, test } from '@playwright/test'

import { waitForEditor } from './support/nodegrade'

/**
 * The direct entry at the application root (SPEC-0002/FR-001, AC-003, AC-003a): a
 * visitor gets a workspace of their own, creates a workflow in it, and finds it again
 * after a reload; the template gallery copies a published template into the same
 * workspace. No workshop code is involved on this path.
 */

// The one template the debug stack can run: its model catalogue holds only the
// deterministic worker, and the bundled workshop templates name a hosted model.
const DEBUG_TEMPLATE = 'Debug workflow'

const workspaceState = (page: Parameters<typeof waitForEditor>[0]) =>
  page.evaluate(() => window.__NODEGRADE_DEBUG__?.workspaceState())

test('a visitor creates a workflow in a browser workspace and keeps it across a reload', async ({
  page
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New workflow' }).click()
  await waitForEditor(page)
  const editorUrl = page.url()

  const state = await workspaceState(page)
  expect(state?.type).toBe('BROWSER')
  expect(state?.workspaceId).toBeTruthy()
  // The way home is the editor's own: there is no title bar on the canvas.
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Workshop', exact: true })).toHaveCount(0)

  await page.reload()
  await waitForEditor(page)
  expect(page.url()).toBe(editorUrl)
  expect((await workspaceState(page))?.workspaceId).toBe(state?.workspaceId)

  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: 'Workflows', exact: true }).click()
  await expect(
    page.getByRole('list', { name: 'My workflows' }).getByText('Untitled workflow')
  ).toBeVisible()
})

test('the template gallery copies a template into the browser workspace', async ({
  page
}) => {
  await page.goto('/templates')
  await expect(page.getByRole('button', { name: 'Use template' }).first()).toBeVisible()
  expect(await page.getByRole('button', { name: 'Use template' }).count()).toBeGreaterThan(
    0
  )

  const card = page.getByRole('article', { name: DEBUG_TEMPLATE, exact: true })
  await card.getByRole('button', { name: 'Preview structure' }).click()
  await expect(page.getByLabel('Template structure')).toContainText(
    /\d+ nodes · \d+ connections/
  )
  await page.getByRole('button', { name: 'Close' }).click()

  await card.getByRole('button', { name: 'Use template' }).click()
  await waitForEditor(page)
  await expect(page.getByText(DEBUG_TEMPLATE)).toBeVisible()
  expect((await workspaceState(page))?.type).toBe('BROWSER')

  // The copy belongs to this browser's workspace, so a reload opens it again.
  const copyUrl = page.url()
  await page.reload()
  await waitForEditor(page)
  expect(page.url()).toBe(copyUrl)
  await expect(page.getByText(DEBUG_TEMPLATE)).toBeVisible()
})
