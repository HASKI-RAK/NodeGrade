import { compactNodeWidgets, getNodeDefinitions, LiteGraph } from '@haski/ta-lib'
import SearchIcon from '@mui/icons-material/Search'
import {
  Box,
  Button,
  Divider,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography
} from '@mui/material'
import type { LGraph, LGraphCanvas, LGraphNode } from 'litegraph.js'
import { useMemo, useState } from 'react'

import type { WorkflowTemplate } from '@/api/http'

import { CATEGORY_ORDER } from './categoryInfo'
import { CategoryPill } from './CategoryPill'

export const NodePalette = ({
  graph,
  canvas,
  blocks,
  onMutate,
  onAddNode,
  onAddBlock
}: {
  graph: LGraph
  canvas: LGraphCanvas | null
  blocks: WorkflowTemplate[]
  onMutate: (mutation: () => void) => void
  onAddNode: (node: LGraphNode) => void
  onAddBlock: (block: WorkflowTemplate) => void
}) => {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const definitions = useMemo(
    () =>
      getNodeDefinitions().filter(
        (definition) =>
          !normalized ||
          [
            definition.title,
            definition.description,
            definition.type,
            ...(definition.tags ?? [])
          ].some((value) => value.toLowerCase().includes(normalized))
      ),
    [normalized]
  )
  const filteredBlocks = blocks.filter(
    (block) =>
      !normalized ||
      [
        block.name,
        block.description ?? '',
        block.category ?? '',
        block.slug,
        ...block.tags
      ].some((value) => value.toLowerCase().includes(normalized))
  )

  const addNode = (type: string) => {
    const node = LiteGraph.createNode(type)
    if (!node) return
    const center = canvas?.convertCanvasToOffset([
      canvas.canvas.width / 2,
      canvas.canvas.height / 2
    ]) ?? [0, 0]
    node.pos = [center[0] - node.size[0] / 2, center[1] - node.size[1] / 2]
    compactNodeWidgets(node)
    onMutate(() => {
      graph.add(node)
      canvas?.selectNode(node)
      graph.setDirtyCanvas(true, true)
    })
    onAddNode(node)
  }

  return (
    <Box
      aria-label="Node palette"
      sx={{
        width: 320,
        height: '100%',
        overflowY: 'auto',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        p: 2
      }}
    >
      <Typography variant="h6" mb={1}>
        Add node
      </Typography>
      <TextField
        fullWidth
        size="small"
        label="Search nodes"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          )
        }}
      />
      {CATEGORY_ORDER.map((category) => {
        const matches = definitions.filter(
          (definition) => definition.category === category
        )
        if (!matches.length) return null
        return (
          <Box key={category} mt={2}>
            <CategoryPill category={category} />
            <List dense disablePadding>
              {matches.map((definition) => (
                <ListItem key={definition.type} disablePadding>
                  <Button
                    fullWidth
                    sx={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      textTransform: 'none'
                    }}
                    onClick={() => addNode(definition.type)}
                  >
                    <ListItemText
                      primary={definition.title}
                      secondary={definition.description}
                    />
                  </Button>
                </ListItem>
              ))}
            </List>
          </Box>
        )
      })}
      {!!filteredBlocks.length && (
        <Box mt={2}>
          <Divider />
          <Typography variant="overline">Blocks</Typography>
          <List dense disablePadding>
            {filteredBlocks.map((block) => (
              <ListItem key={block.id} disablePadding>
                <Button
                  fullWidth
                  sx={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    textTransform: 'none'
                  }}
                  onClick={() => onAddBlock(block)}
                >
                  <ListItemText primary={block.name} secondary={block.description} />
                </Button>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  )
}
