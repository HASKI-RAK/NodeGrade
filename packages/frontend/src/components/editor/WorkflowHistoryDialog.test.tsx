import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { WorkflowVersion } from '@/api/http'

import { WorkflowHistoryDialog } from './WorkflowHistoryDialog'

const version = (overrides: Partial<WorkflowVersion> = {}): WorkflowVersion => ({
  id: 'ver-1',
  version: 4,
  name: 'Rubric assessment',
  reason: 'save',
  nodeCount: 3,
  createdAt: '2026-09-22T11:50:00.000Z',
  ...overrides
})

const renderDialog = (
  overrides: Partial<Parameters<typeof WorkflowHistoryDialog>[0]> = {}
) => {
  const props = {
    open: true,
    currentVersion: 7,
    onClose: vi.fn(),
    onLoad: vi.fn().mockResolvedValue([version()]),
    onRestore: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onClear: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
  render(<WorkflowHistoryDialog {...props} />)
  return props
}

describe('WorkflowHistoryDialog', () => {
  it('lists stored versions newest first with their reason (AC-006)', async () => {
    renderDialog({
      onLoad: vi
        .fn()
        .mockResolvedValue([
          version(),
          version({ id: 'ver-0', version: 2, reason: 'reset', nodeCount: 1 })
        ])
    })

    expect(await screen.findByText('Version 4')).toBeVisible()
    expect(screen.getByText('Version 2')).toBeVisible()
    expect(screen.getByText('Before an edit')).toBeVisible()
    expect(screen.getByText('Before reset to template')).toBeVisible()
    expect(screen.getByText(/3 nodes/)).toBeVisible()
    expect(screen.getByText(/1 node$/)).toBeVisible()
  })

  it('invites a first edit when nothing has been captured', async () => {
    renderDialog({ onLoad: vi.fn().mockResolvedValue([]) })

    expect(await screen.findByText(/No earlier versions yet/)).toBeVisible()
  })

  it('asks before restoring, and only then restores (AC-003)', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Restore' }))
    expect(props.onRestore).not.toHaveBeenCalled()
    expect(screen.getByText(/Load this version into the editor\?/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Restore version' }))
    await waitFor(() => expect(props.onRestore).toHaveBeenCalledWith('ver-1'))
  })

  it('lets the confirmation be cancelled', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Delete version 4' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText(/It cannot be brought back/)).toBeNull()
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it('deletes one version and reloads the list (AC-004)', async () => {
    const user = userEvent.setup()
    const onLoad = vi.fn().mockResolvedValueOnce([version()]).mockResolvedValueOnce([])
    const props = renderDialog({ onLoad })

    await user.click(await screen.findByRole('button', { name: 'Delete version 4' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith('ver-1'))
    expect(await screen.findByText(/No earlier versions yet/)).toBeVisible()
  })

  it('confirms before clearing the whole history (AC-004)', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Clear history' }))
    expect(props.onClear).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete all versions' }))
    await waitFor(() => expect(props.onClear).toHaveBeenCalled())
  })

  it('reports a failed read and retries it', async () => {
    const user = userEvent.setup()
    const onLoad = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce([version()])
    renderDialog({ onLoad })

    expect(await screen.findByText('Network down')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Version 4')).toBeVisible()
  })

  it('keeps the dialog open and shows why a restore failed', async () => {
    const user = userEvent.setup()
    const props = renderDialog({
      onRestore: vi.fn().mockRejectedValue(new Error('Version is gone'))
    })

    await user.click(await screen.findByRole('button', { name: 'Restore' }))
    await user.click(screen.getByRole('button', { name: 'Restore version' }))

    expect(await screen.findByText('Version is gone')).toBeVisible()
    expect(props.onClose).not.toHaveBeenCalled()
  })
})
