import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { COLOR_SCHEME_STORAGE_KEY, ColorSchemeProvider } from '@/theme/colorScheme'

import { EditorToolbar } from './EditorToolbar'

describe('EditorToolbar', () => {
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('exposes primary and overflow actions', async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    render(
      <EditorToolbar
        workflowName="Demo"
        status="saved"
        student={false}
        canSaveAs
        canReset
        ltiInstructor
        developerTools={false}
        connectionStatus="Connected"
        onAdd={action}
        onTemplates={action}
        onRun={action}
        onPreview={action}
        onSaveAs={async () => undefined}
        onHistory={action}
        onImport={async () => undefined}
        onExport={action}
        onReset={async () => undefined}
        onDeveloperTools={action}
        onPublish={async () => undefined}
        onRetry={action}
        onReloadLatest={action}
        connectionInfo={{
          apiOrigin: 'http://api',
          wsOrigin: 'ws://api',
          workspaceType: 'BROWSER',
          workflowId: 'wf-1'
        }}
      />
    )
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Run' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'More editor actions' }))
    expect(screen.getByText('Save as…')).toBeVisible()
    expect(screen.getByText('Version history…')).toBeVisible()
    expect(screen.getByText('Import workflow…')).toBeVisible()
    expect(screen.getByText('Export workflow')).toBeVisible()
    expect(screen.getByText('Reset to source template…')).toBeVisible()
    expect(screen.getByText('Connection information')).toBeVisible()
    expect(screen.getByText('Publish to students')).toBeVisible()
  })

  it('confirms before resetting a template-derived workflow', async () => {
    const user = userEvent.setup()
    const reset = vi.fn().mockResolvedValue(undefined)
    render(
      <EditorToolbar
        workflowName="Demo"
        status="saved"
        student={false}
        canSaveAs
        canReset
        ltiInstructor={false}
        developerTools={false}
        connectionStatus="Connected"
        onAdd={vi.fn()}
        onTemplates={vi.fn()}
        onRun={vi.fn()}
        onPreview={vi.fn()}
        onSaveAs={async () => undefined}
        onHistory={vi.fn()}
        onImport={async () => undefined}
        onExport={vi.fn()}
        onReset={reset}
        onDeveloperTools={vi.fn()}
        onPublish={async () => undefined}
        onRetry={vi.fn()}
        onReloadLatest={vi.fn()}
        connectionInfo={{
          apiOrigin: 'http://api',
          wsOrigin: 'ws://api',
          workspaceType: 'BROWSER',
          workflowId: 'wf-1'
        }}
      />
    )

    await user.click(screen.getByRole('button', { name: 'More editor actions' }))
    await user.click(screen.getByText('Reset to source template…'))
    expect(
      screen.getByRole('heading', { name: 'Reset to source template?' })
    ).toBeVisible()
    expect(reset).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reset workflow' }))
    expect(reset).toHaveBeenCalledOnce()
  })

  it('offers a system/light/dark appearance picker that persists', async () => {
    const user = userEvent.setup()
    localStorage.clear()
    const action = vi.fn()
    render(
      <ColorSchemeProvider>
        <EditorToolbar
          workflowName="Demo"
          status="saved"
          student={false}
          canSaveAs
          canReset={false}
          ltiInstructor={false}
          developerTools={false}
          connectionStatus="Connected"
          onAdd={action}
          onTemplates={action}
          onRun={action}
          onPreview={action}
          onSaveAs={async () => undefined}
          onHistory={action}
          onImport={async () => undefined}
          onExport={action}
          onReset={async () => undefined}
          onDeveloperTools={action}
          onPublish={async () => undefined}
          onRetry={action}
          onReloadLatest={action}
          connectionInfo={{
            apiOrigin: 'http://api',
            wsOrigin: 'ws://api',
            workspaceType: 'BROWSER',
            workflowId: 'wf-1'
          }}
        />
      </ColorSchemeProvider>
    )

    await user.click(screen.getByRole('button', { name: 'More editor actions' }))
    expect(screen.getByRole('menuitem', { name: /System/ })).toBeVisible()
    await user.click(screen.getByRole('menuitem', { name: /Dark/ }))
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark')
  })

  it('explains node colors and adding nodes in a help dialog', async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    render(
      <EditorToolbar
        workflowName="Demo"
        status="saved"
        student={false}
        canSaveAs
        canReset={false}
        ltiInstructor={false}
        developerTools={false}
        connectionStatus="Connected"
        onAdd={action}
        onTemplates={action}
        onRun={action}
        onPreview={action}
        onSaveAs={async () => undefined}
        onHistory={action}
        onImport={async () => undefined}
        onExport={action}
        onReset={async () => undefined}
        onDeveloperTools={action}
        onPublish={async () => undefined}
        onRetry={action}
        onReloadLatest={action}
        connectionInfo={{
          apiOrigin: 'http://api',
          wsOrigin: 'ws://api',
          workspaceType: 'BROWSER',
          workflowId: 'wf-1'
        }}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Editor help' }))
    expect(
      screen.getByRole('heading', { name: 'Node colors and adding nodes' })
    ).toBeVisible()
    for (const category of ['Essential', 'AI', 'Assessment', 'Validation'])
      expect(screen.getByText(category, { exact: false })).toBeVisible()
    expect(screen.getByText('Adding nodes')).toBeVisible()
  })
})
