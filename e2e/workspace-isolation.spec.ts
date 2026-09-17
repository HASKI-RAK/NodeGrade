import { expect, test } from '@playwright/test'

import {
  backendUrl,
  joinWorkshop,
  nodeIdByTitle,
  nodeProperty,
  saveNow,
  WAIE_WORKSHOP_CODE,
  waitForEditor,
  workshopToken
} from './support/nodegrade'

/**
 * Workspace isolation, verified through two real browsers rather than through the guard's
 * unit tests (SPEC-0008/FR-007, AC-007; SPEC-0004/FR-005).
 *
 * Both participants join the same workshop code, so both hold a workflow under the same
 * slug. The slug collides on purpose: it is what makes the per-workspace uniqueness
 * constraint the thing under test instead of an accident of naming.
 */
test('two participants editing one workshop code never see each other’s graph', async ({
  browser,
  request
}) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const [first, second] = await Promise.all(
    contexts.map((context) => context.newPage())
  )

  try {
    await Promise.all([
      joinWorkshop(first, WAIE_WORKSHOP_CODE),
      joinWorkshop(second, WAIE_WORKSHOP_CODE)
    ])

    const [firstState, secondState] = await Promise.all([
      first.evaluate(() => window.__NODEGRADE_DEBUG__?.workspaceState()),
      second.evaluate(() => window.__NODEGRADE_DEBUG__?.workspaceState())
    ])
    expect(firstState?.type).toBe('WORKSHOP')
    expect(secondState?.type).toBe('WORKSHOP')
    expect(firstState?.workspaceId).toBeTruthy()
    expect(firstState?.workspaceId).not.toBe(secondState?.workspaceId)
    expect(firstState?.workflowId).not.toBe(secondState?.workflowId)

    // Same slug, different workspaces: the collision the isolation guarantee is about.
    const slugs = await Promise.all(
      [first, second].map(async (page) => {
        const token = await workshopToken(page, WAIE_WORKSHOP_CODE)
        const state = await page.evaluate(() =>
          window.__NODEGRADE_DEBUG__?.workspaceState()
        )
        const response = await request.get(
          `${backendUrl}/api/workflows/${state?.workflowId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        await expect(response).toBeOK()
        return ((await response.json()) as { slug: string }).slug
      })
    )
    expect(slugs[0]).toBe(slugs[1])

    const rubricId = await nodeIdByTitle(first, 'Rubric')
    const edits = ['Rubric edited by the first participant.', 'Second participant’s rubric.']
    for (const [index, page] of [first, second].entries()) {
      await page.evaluate(
        (edit) =>
          window.__NODEGRADE_DEBUG__?.setNodeProperty(edit.id, 'value', edit.value),
        { id: rubricId, value: edits[index] }
      )
      await saveNow(page)
    }

    await Promise.all([first.reload(), second.reload()])
    await Promise.all([waitForEditor(first), waitForEditor(second)])
    expect(await nodeProperty(first, rubricId, 'value')).toBe(edits[0])
    expect(await nodeProperty(second, rubricId, 'value')).toBe(edits[1])
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
