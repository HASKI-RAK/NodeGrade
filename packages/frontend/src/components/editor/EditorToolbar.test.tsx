import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EditorToolbar } from './EditorToolbar'

describe('EditorToolbar', () => {
  it('exposes primary and overflow actions', async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    render(
      <EditorToolbar
        workflowName="Demo"
        status="saved"
        student={false}
        canSaveAs
        ltiInstructor
        developerTools={false}
        connectionStatus="Connected"
        onAdd={action}
        onTemplates={action}
        onRun={action}
        onPreview={action}
        onSaveAs={async () => undefined}
        onImport={async () => undefined}
        onExport={action}
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
    expect(screen.getByText('Import workflow…')).toBeVisible()
    expect(screen.getByText('Export workflow')).toBeVisible()
    expect(screen.getByText('Connection information')).toBeVisible()
    expect(screen.getByText('Publish to students')).toBeVisible()
  })
})
