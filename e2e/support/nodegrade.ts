import { expect, type Page } from '@playwright/test'

/**
 * The editor's debug bridge (`packages/frontend/src/utils/debugBridge.ts`), exposed only
 * when the frontend runs with VITE_DEBUG_BRIDGE=true.
 *
 * The suite uses it for what a bitmap canvas makes unreachable — selecting a node, reading
 * a node property, waiting for a socket event — and drives everything a participant can
 * actually see through the real user interface.
 */
export type DebugNode = {
  id: number
  title: string
  type: string | null
  properties: Record<string, unknown>
}

export type DebugBridge = {
  version: 2
  listNodes(): DebugNode[]
  getNode(id: number): DebugNode | undefined
  selectNode(id: number): boolean
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

/** The deterministic workshop the stack seeds: a three-node graph with no model node. */
export const DEBUG_WORKSHOP_CODE = 'WAVE-2026'

/** The canonical WAIE workshop the conference smoke test walks (SPEC-0007/FR-001). */
export const WAIE_WORKSHOP_CODE = 'WAIE-2026'

export const backendUrl = `http://127.0.0.1:${process.env.NODEGRADE_DEBUG_BACKEND_PORT ?? '15000'}`

export const modelUrl = `http://127.0.0.1:${process.env.NODEGRADE_DEBUG_MODEL_PORT ?? '18000'}`

/** The only model any run in this suite may reach (SPEC-0008/FR-006). */
export const DETERMINISTIC_PROVIDER_KEY = 'local'
export const DETERMINISTIC_MODEL_ID = 'nodegrade-deterministic'

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '')

export const waitForEditor = async (page: Page) => {
  await page.waitForURL(/\/editor\//)
  await page.waitForFunction(() => window.__NODEGRADE_DEBUG__?.version === 2)
  await expect(page.locator('#mycanvas')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.__NODEGRADE_DEBUG__?.socketState().connected))
    .toBe(true)
}

/** The deep-link half of workshop entry: `/workshop/<code>`, no landing page in between. */
export const joinWorkshop = async (page: Page, code = DEBUG_WORKSHOP_CODE) => {
  await page.goto(`/workshop/${code}`)
  await waitForEditor(page)
}

/** The landing-page half: type the handout code and press Join (SPEC-0002/FR-001). */
export const joinFromLandingPage = async (page: Page, code = WAIE_WORKSHOP_CODE) => {
  await page.goto('/')
  await page.getByTestId('workshop-code').fill(code)
  await page.getByTestId('join-workshop').click()
  await waitForEditor(page)
}

export const listNodes = (page: Page): Promise<DebugNode[]> =>
  page.evaluate(() => window.__NODEGRADE_DEBUG__?.listNodes() ?? [])

export const nodeIdByTitle = async (page: Page, title: string): Promise<number> => {
  const nodes = await listNodes(page)
  const node = nodes.find((candidate) => candidate.title === title)
  expect(node, `no node titled "${title}"`).toBeDefined()
  return node!.id
}

export const nodeIdsByType = async (page: Page, type: string): Promise<number[]> => {
  const nodes = await listNodes(page)
  return nodes.filter((node) => node.type === type).map((node) => node.id)
}

export const nodeProperty = (
  page: Page,
  id: number,
  property: string
): Promise<unknown> =>
  page.evaluate(
    (target) => window.__NODEGRADE_DEBUG__?.getNode(target.id)?.properties[target.property],
    { id, property }
  )

/** Opens the inspector on one node. The canvas is a bitmap; there is nothing to click. */
export const inspectNode = async (page: Page, id: number) => {
  await page.evaluate((nodeId) => window.__NODEGRADE_DEBUG__?.selectNode(nodeId), id)
  await expect.poll(() => selectedNodeIds(page)).toEqual([id])
}

export const selectedNodeIds = (page: Page): Promise<number[]> =>
  page.evaluate(() => window.__NODEGRADE_DEBUG__?.selectedNodeIds() ?? [])

export const saveNow = async (page: Page) => {
  await expect(page.evaluate(() => window.__NODEGRADE_DEBUG__?.saveNow())).resolves.toBe(
    'saved'
  )
}

/** The workspace token this browser profile holds for a workshop code. */
export const workshopToken = (page: Page, code: string): Promise<string | undefined> =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { token: string }).token : undefined
  }, `nodegrade.workshop-workspace.${normalizeCode(code)}`)
