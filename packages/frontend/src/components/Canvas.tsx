/* eslint-disable immutable/no-mutation */
import { LGraph } from '@haski/ta-lib'
import { LGraphCanvas } from 'litegraph.js'
import { useEffect, useRef } from 'react'

type CanvasProps = {
  width: number
  height: number
  lgraph: LGraph
}

const Canvas = (props: CanvasProps) => {
  const lcanvas = useRef<LGraphCanvas>()
  const canvasRef = useRef(null)

  useEffect(() => {
    console.log('Canvas mounted or lgraph updated')

    if (canvasRef.current) {
      if (!lcanvas.current) {
        // Initialize canvas if it doesn't exist
        lcanvas.current = new LGraphCanvas(canvasRef.current, props.lgraph)
        lcanvas.current.allow_interaction = true
      } else {
        // Update the graph reference if canvas already exists
        lcanvas.current.setGraph(props.lgraph)
      }

      // Force a redraw
      props.lgraph.setDirtyCanvas(true, true)
    }

    return () => {
      // Only stop the graph when component unmounts
      if (lcanvas.current && canvasRef.current === null) {
        props.lgraph.stop()
      }
    }
  }, [props.lgraph, canvasRef.current])

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      width={props.width}
      height={props.height}
      id="mycanvas"
      style={{ border: '1px solid' }}
    />
  )
}

export default Canvas
