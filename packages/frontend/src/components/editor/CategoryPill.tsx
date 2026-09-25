import { CATEGORY_COLORS, type NodeCategory } from '@haski/ta-lib'
import { Box } from '@mui/material'

export const CategoryPill = ({ category }: { category: NodeCategory }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      height: 20,
      px: 1,
      borderRadius: '6px',
      bgcolor: CATEGORY_COLORS[category],
      color: '#14161C',
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      lineHeight: 1,
      whiteSpace: 'nowrap'
    }}
  >
    {category}
  </Box>
)
