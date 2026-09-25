import { expect, type Page, test } from '@playwright/test'

import {
  joinFromLandingPage,
  WAIE_WORKSHOP_CODE,
  waitForEditor
} from './support/nodegrade'

/**
 * The tutor loop on top of a run (SPEC-0020/AC-009 to AC-011): every run becomes a
 * submission, one can be marked reviewed, the inbox survives a reload, and an old answer
 * runs again against the current graph. The WAIE template has no review stage, so the
 * flag itself is not asserted here; the review-flag node has its own backend suite.
 */

const ANSWER =
  'Plants use light, water and carbon dioxide to make glucose and release oxygen, which other organisms breathe.'

const runToCompletion = async (page: Page) => {
  const outcome = await page.evaluate(async () => {
    const debug = window.__NODEGRADE_DEBUG__
    if (!debug) throw new Error('NodeGrade debug bridge is unavailable.')
    return Promise.race([
      debug.waitForEvent('graphFinished', 60_000).then(() => 'graphFinished' as const),
      debug
        .waitForEvent('graphOperationFailed', 60_000)
        .then(() => 'graphOperationFailed' as const)
    ])
  })
  expect(outcome).toBe('graphFinished')
}

test('a participant sees each run as a submission, reviews it and runs it again', async ({
  page
}) => {
  test.slow()
  await joinFromLandingPage(page, WAIE_WORKSHOP_CODE)

  await page.getByRole('button', { name: 'Preview' }).click()
  const submissionsTab = page.getByRole('tab', { name: /^Submissions/ })
  await expect(submissionsTab).toBeVisible()
  await page.getByRole('textbox', { name: 'Your answer' }).fill(ANSWER)
  await page.getByRole('button', { name: 'Run assessment' }).click()
  await runToCompletion(page)

  // The record is written before the terminal event, so the tab refetches into a list of one.
  await submissionsTab.click()
  const counts = page.getByRole('group', { name: 'Submission counts' })
  await expect(counts.getByLabel('Submissions', { exact: true })).toContainText('1')
  const list = page.getByRole('list', { name: 'Submission list' })
  await expect(list.getByRole('button')).toHaveCount(1)

  await list.getByRole('button').first().click()
  const detail = page.getByLabel('Submission', { exact: true })
  await expect(detail.getByText(ANSWER)).toBeVisible()
  await expect(detail.getByRole('article', { name: 'Score' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark as reviewed' }).click()
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible()

  await page.getByRole('button', { name: 'Back to submissions' }).click()
  await expect(counts.getByLabel('Reviewed', { exact: true })).toContainText('1')

  // The inbox is server side: a reload finds the same submission, still reviewed.
  await page.reload()
  await waitForEditor(page)
  await page.getByRole('button', { name: 'Preview' }).click()
  await submissionsTab.click()
  await expect(counts.getByLabel('Submissions', { exact: true })).toContainText('1')
  await expect(counts.getByLabel('Reviewed', { exact: true })).toContainText('1')

  // Run again puts the stored answer through the current graph as a new submission.
  await list.getByRole('button').first().click()
  await page.getByRole('button', { name: 'Run again' }).click()
  await expect(page.getByRole('tab', { name: 'Test' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await runToCompletion(page)
  await submissionsTab.click()
  await expect(counts.getByLabel('Submissions', { exact: true })).toContainText('2')
  await expect(list.getByRole('button')).toHaveCount(2)
})
