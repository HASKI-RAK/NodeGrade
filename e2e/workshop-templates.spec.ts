import { expect, test } from '@playwright/test'

import {
  backendUrl,
  facilitatorApi,
  publishWorkshop,
  templateBySlug,
  waitForEditor,
  workshopToken
} from './support/nodegrade'

// SPEC-0022: a workshop offers several templates, it is the only way in, and closing it
// leaves its participants read-only.

// The two templates the debug stack can run: its model catalogue holds only the
// deterministic worker, and the bundled workshop templates name a hosted model.
const DEBUG_SLUG = 'debug-workflow'
const WAIE_SLUG = 'waie-assessment'

const uniqueTitle = (label: string, project: string) =>
  `${label} ${project} ${Date.now()}`

test('a workshop offers several templates on its overview (SPEC-0022/AC-006, AC-007)', async ({
  page,
  request
}, testInfo) => {
  const api = await facilitatorApi(request)
  const [waie, debug] = await Promise.all([
    templateBySlug(api, WAIE_SLUG),
    templateBySlug(api, DEBUG_SLUG)
  ])
  const title = uniqueTitle('Two exercises', testInfo.project.name)
  // WAIE pinned to the deterministic revision the seed wrote; the debug workflow follows
  // its newest revision.
  const workshop = await publishWorkshop(api, title, [
    { templateId: waie.id, templateRevisionId: waie.revisionIds[0] },
    { templateId: debug.id }
  ])

  await page.goto(`/workshop/${workshop.code}`)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Debug workflow' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(2)
  await expect(page.getByText('Start a template above')).toBeVisible()

  await page.getByRole('button', { name: 'Preview structure' }).first().click()
  await expect(page.getByLabel('Template structure')).toContainText(
    /\d+ nodes · \d+ connections/
  )
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Start' }).first().click()
  await waitForEditor(page)
  const copy = page.url()

  await page.getByRole('button', { name: 'Workshop', exact: true }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continue' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(1)

  await page.getByRole('link', { name: 'Continue' }).click()
  await waitForEditor(page)
  expect(page.url()).toBe(copy)
})

test('closing a workshop leaves its participants read-only (SPEC-0022/AC-009)', async ({
  page,
  request
}, testInfo) => {
  const api = await facilitatorApi(request)
  const template = await templateBySlug(api, DEBUG_SLUG)
  const workshop = await publishWorkshop(
    api,
    uniqueTitle('Closing soon', testInfo.project.name),
    [{ templateId: template.id }]
  )

  await page.goto(`/workshop/${workshop.code}`)
  await waitForEditor(page)
  const workflowId = new URL(page.url()).pathname.split('/').at(-1)
  await expect(page.getByRole('button', { name: 'Run' })).toBeVisible()

  await api.post(`/admin/workshops/${workshop.id}/close`)
  await page.reload()

  await expect(page.getByText(/This workshop has ended/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0)

  const token = await workshopToken(page, workshop.code)
  const save = await request.put(`${backendUrl}/api/workflows/${workflowId}`, {
    headers: { Authorization: `Bearer ${token}`, 'If-Match': '"1"' },
    data: { content: '{"nodes":[]}' }
  })
  expect(save.status()).toBe(403)
  expect(((await save.json()) as { code: string }).code).toBe('workshop_closed')

  await page.goto(`/workshop/${workshop.code}`)
  await expect(page.getByText(/This workshop has ended/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible()
})

test('the start page offers only a workshop code (SPEC-0022/AC-010)', async ({
  page,
  request
}) => {
  await page.goto('/')
  await expect(page.getByTestId('workshop-code')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New workflow' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Templates' })).toHaveCount(0)

  await page.goto('/templates')
  await expect(page).toHaveURL(/\/$/)

  const anonymous = await request.get(`${backendUrl}/api/templates`)
  expect(anonymous.status()).toBe(401)
  const create = await request.post(`${backendUrl}/api/workspaces`, { data: {} })
  expect(create.status()).toBe(404)
})
