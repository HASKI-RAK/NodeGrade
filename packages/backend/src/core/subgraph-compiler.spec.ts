import { LGraph } from '@haski/ta-lib';
import {
  compileEditorGraphForExecution,
  SubgraphCompileError,
} from './subgraph-compiler.js';

const registered = (types: string[]) => (type: string) => types.includes(type);

const innerText = (id: number, value: string) => ({
  id,
  type: 'basic/string',
  pos: [0, 0] as [number, number],
  inputs: [],
  outputs: [{ name: 'value', type: 'string' }],
  properties: { value },
});

const innerWatch = (id: number) => ({
  id,
  type: 'basic/watch',
  pos: [0, 0] as [number, number],
  inputs: [{ name: 'value', type: 'string' }],
  outputs: [],
});

const wrapper = (
  id: number,
  title: string,
  nested: { nodes: unknown[]; links: unknown[] },
  boundary: unknown[],
) => ({
  id,
  type: 'graph/subgraph',
  pos: [0, 0] as [number, number],
  title,
  properties: { templateBoundary: boundary },
  subgraph: { ...nested, groups: [], config: {}, extra: {}, version: 0.4 },
});

describe('compileEditorGraphForExecution', () => {
  it('flattens a wrapper into execution nodes with a stable source map', () => {
    const content = {
      nodes: [
        innerText(1, 'hello'),
        wrapper(
          2,
          'Feedback Generator',
          {
            nodes: [
              innerWatch(1),
              innerText(2, 'inner'),
              {
                id: 3,
                type: 'graph/input',
                pos: [0, 0],
                inputs: [],
                outputs: [{ name: 'Text', type: 'string' }],
                properties: { name: 'Text', type: 'string' },
              },
              {
                id: 4,
                type: 'graph/output',
                pos: [0, 0],
                inputs: [{ name: 'Feedback', type: 'string' }],
                outputs: [],
                properties: { name: 'Feedback', type: 'string' },
              },
            ],
            // Adapter links dissolve: the outer link through the wrapper input
            // port feeds the inner watch, and the inner text feeds nothing here.
            // A direct inner link exercises topology preservation.
            links: [
              [1, 3, 0, 1, 0, 'string'],
              [2, 2, 0, 1, 0, 'string'],
            ],
          },
          [
            {
              key: 'text',
              label: 'Text',
              dataType: 'string',
              direction: 'input',
              internalNodeId: 1,
              internalSlot: 0,
            },
            {
              key: 'feedback',
              label: 'Feedback',
              dataType: 'string',
              direction: 'output',
              internalNodeId: 2,
              internalSlot: 0,
            },
          ],
        ),
      ],
      // Outer text feeds the wrapper input port 0; wrapper output port 0 is unused.
      links: [[1, 1, 0, 2, 0, 'string']],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };

    const compiled = compileEditorGraphForExecution(content as never, {
      registeredType: registered(['basic/string', 'basic/watch']),
    });

    // One top-level node plus two inner nodes; adapters dissolve.
    expect(compiled.content.nodes.map((node) => node.type).sort()).toEqual([
      'basic/string',
      'basic/string',
      'basic/watch',
    ]);
    expect(compiled.content.links).toHaveLength(2);
    // Outer link reaches the inner watch; inner text feeds the inner watch too.
    // Both links target the same execution node on the same slot.
    const watchExecutionId = compiled.sourceMap.find(
      (entry) => entry.traceLabel === 'Feedback Generator / node 1',
    )?.executionId;
    expect(watchExecutionId).toBeDefined();
    for (const link of compiled.content.links as unknown[][]) {
      expect(link[3]).toBe(watchExecutionId);
      expect(link[4]).toBe(0);
    }
    const watchEntry = compiled.sourceMap.find(
      (entry) => entry.traceLabel === 'Feedback Generator / node 1',
    );
    expect(watchEntry).toMatchObject({ wrapperId: 2, sourceId: 1 });
    expect(watchEntry?.wrapperPath).toEqual(['Feedback Generator']);
    expect(
      compiled.sourceMap.find((entry) => entry.wrapperId === null),
    ).toMatchObject({ sourceId: 1 });

    // The compiled graph loads in a real LGraph without losing nodes.
    const graph = new LGraph();
    graph.configure(structuredClone(compiled.content) as never);
    expect(graph.serialize().nodes).toHaveLength(3);
  });

  it('preserves topology across repeated compilation', () => {
    const content = {
      nodes: [
        wrapper(
          5,
          'Block',
          {
            nodes: [innerText(1, 'a'), innerWatch(2)],
            links: [[1, 1, 0, 2, 0, 'string']],
          },
          [],
        ),
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    const first = compileEditorGraphForExecution(content as never, {
      registeredType: registered(['basic/string', 'basic/watch']),
    });
    const second = compileEditorGraphForExecution(content as never, {
      registeredType: registered(['basic/string', 'basic/watch']),
    });
    expect(first).toEqual(second);
  });

  it('reports the wrapper path and inner identity for bad boundaries and types', () => {
    const missingInner = {
      nodes: [
        wrapper(2, 'Feedback Generator', { nodes: [], links: [] }, [
          {
            key: 'out',
            label: 'Out',
            dataType: 'string',
            direction: 'output',
            internalNodeId: 9,
            internalSlot: 0,
          },
        ]),
      ],
      links: [[1, 9, 0, 2, 0, 'string']],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    // Outer link targets wrapper output port 0, whose boundary points nowhere.
    const badBoundary = {
      ...missingInner,
      nodes: [
        wrapper(
          2,
          'Feedback Generator',
          { nodes: [innerText(1, 'a')], links: [] },
          [
            {
              key: 'out',
              label: 'Out',
              dataType: 'string',
              direction: 'output',
              internalNodeId: 9,
              internalSlot: 0,
            },
          ],
        ),
      ],
      links: [[1, 2, 0, 1, 0, 'string']],
    };
    expect(() =>
      compileEditorGraphForExecution(badBoundary as never, {
        registeredType: registered(['basic/string']),
      }),
    ).toThrow(SubgraphCompileError);

    const unknownType = {
      nodes: [
        wrapper(
          2,
          'Feedback Generator',
          {
            nodes: [{ ...innerText(1, 'a'), type: 'input/telepathy' }],
            links: [],
          },
          [],
        ),
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    try {
      compileEditorGraphForExecution(unknownType as never, {
        registeredType: registered(['basic/string']),
      });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SubgraphCompileError);
      expect((error as SubgraphCompileError).message).toContain(
        'Feedback Generator',
      );
      expect((error as SubgraphCompileError).message).toContain(
        'input/telepathy',
      );
    }
  });

  it('rejects a missing required boundary input with block and node identity', () => {
    const content = {
      nodes: [
        wrapper(
          2,
          'Feedback Generator',
          { nodes: [innerWatch(1)], links: [] },
          [
            {
              key: 'text',
              label: 'Text to review',
              dataType: 'string',
              direction: 'input',
              internalNodeId: 1,
              internalSlot: 0,
              required: true,
            },
          ],
        ),
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    expect(() =>
      compileEditorGraphForExecution(content as never, {
        registeredType: registered(['basic/watch']),
      }),
    ).toThrow(
      /Feedback Generator \/ node 1: missing required input Text to review/,
    );
  });

  it('executes compiled async inner nodes through the awaited runner', async () => {
    const { executeLgraph } = await import('./Graph.js');
    const content = {
      nodes: [
        wrapper(
          2,
          'Async Block',
          {
            nodes: [
              {
                id: 1,
                type: 'basic/string',
                pos: [0, 0],
                inputs: [],
                outputs: [{ name: 'value', type: 'string' }],
                properties: { value: 'async-value' },
              },
            ],
            links: [],
          },
          [],
        ),
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    const compiled = compileEditorGraphForExecution(content as never, {
      registeredType: registered(['basic/string']),
    });
    const graph = new LGraph();
    graph.configure(structuredClone(compiled.content) as never);
    const seen: string[] = [];
    await executeLgraph(graph, undefined, false, {
      onNodeEvent: (event) => {
        if (event.state === 'completed') seen.push(String(event.node.id));
      },
    });
    expect(seen).toHaveLength(1);
  });

  it('propagates cancellation and timeout to compiled inner nodes', async () => {
    const { executeLgraph } = await import('./Graph.js');
    const content = {
      nodes: [
        wrapper(
          2,
          'Slow Block',
          {
            nodes: [
              {
                id: 1,
                type: 'basic/string',
                pos: [0, 0],
                inputs: [],
                outputs: [{ name: 'value', type: 'string' }],
                properties: { value: 'slow' },
              },
            ],
            links: [],
          },
          [],
        ),
      ],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    const compiled = compileEditorGraphForExecution(content as never, {
      registeredType: registered(['basic/string']),
    });

    const cancelledGraph = new LGraph();
    cancelledGraph.configure(structuredClone(compiled.content) as never);
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeLgraph(cancelledGraph, undefined, false, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ traceError: { code: 'cancelled' } });

    const timedGraph = new LGraph();
    timedGraph.configure(structuredClone(compiled.content) as never);
    const blocking = timedGraph.getNodeById(1);
    if (blocking) {
      blocking.onExecute = async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      };
    }
    await expect(
      executeLgraph(timedGraph, undefined, false, { timeoutMs: 5 }),
    ).rejects.toMatchObject({ traceError: { code: 'timeout' } });
  });

  it('enforces the execution node limit', () => {
    const content = {
      nodes: [innerText(1, 'a'), innerText(2, 'b')],
      links: [],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    expect(() =>
      compileEditorGraphForExecution(content as never, {
        registeredType: registered(['basic/string']),
        maxNodes: 1,
      }),
    ).toThrow(/execution limit/);
  });
});
