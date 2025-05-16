import { LGraph, LGraphNode } from '@haski/ta-lib';

export async function executeLgraph(
  lgraph: LGraph,
  updateProgressCallback?: (progress: number) => void,
  onlyOnExecute = false,
) {
  const execorder = lgraph.computeExecutionOrder<LGraphNode[]>(
    onlyOnExecute,
    true,
  );
  for (const [index, node] of execorder.entries()) {
    try {
      await node.onExecute?.();
      updateProgressCallback?.(index / execorder.length);
    } catch (error: unknown) {
      console.error('Error executing node:', error);
      // TODO reset node green states
    }
  }
  return lgraph;
}
