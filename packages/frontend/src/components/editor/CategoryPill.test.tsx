import { CATEGORY_COLORS } from '@haski/ta-lib'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CATEGORY_ORDER } from './categoryInfo'
import { CategoryPill } from './CategoryPill'

describe('CategoryPill', () => {
  it('renders every category label in its category color', () => {
    for (const category of CATEGORY_ORDER) {
      const { unmount } = render(<CategoryPill category={category} />)
      const pill = screen.getByText(category)
      expect(pill).toBeVisible()
      expect(pill).toHaveStyle(`background-color: ${CATEGORY_COLORS[category]}`)
      unmount()
    }
  })
})
