import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EditorRail } from './EditorRail'

describe('EditorRail', () => {
  it('resizes the desktop rail from its left edge', () => {
    render(
      <EditorRail mobile={false} open onClose={vi.fn()}>
        Details
      </EditorRail>
    )

    const rail = screen.getByLabelText('Editor details')
    const handle = screen.getByRole('separator', { name: 'Resize editor details' })
    Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() })

    fireEvent.pointerDown(handle, { clientX: 600, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 500, pointerId: 1 })

    expect(rail).toHaveStyle({ width: '500px', minWidth: '500px' })
    expect(handle).toHaveAttribute('aria-valuenow', '500')
  })

  it('supports keyboard resizing and enforces the minimum width', () => {
    render(
      <EditorRail mobile={false} open onClose={vi.fn()}>
        Details
      </EditorRail>
    )

    const handle = screen.getByRole('separator', { name: 'Resize editor details' })
    fireEvent.keyDown(handle, { key: 'Home' })

    expect(screen.getByLabelText('Editor details')).toHaveStyle({ width: '280px' })
    expect(handle).toHaveAttribute('aria-valuenow', '280')
  })

  it('keeps the mobile rail full-width without a resize handle', () => {
    render(
      <EditorRail mobile open onClose={vi.fn()}>
        Details
      </EditorRail>
    )

    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Editor details')).toHaveStyle({ width: '100%' })
  })
})
