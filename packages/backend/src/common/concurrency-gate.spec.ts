import {
  ConcurrencyGate,
  ConcurrencyLimitError,
} from './concurrency-gate.js';

describe('ConcurrencyGate', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('admits up to the limit and queues the rest in order', async () => {
    const gate = new ConcurrencyGate(2, 1_000);
    const first = await gate.acquire();
    await gate.acquire();

    const order: string[] = [];
    const queued = gate.acquire().then((release) => {
      order.push('third');
      return release;
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    expect(gate.activeCount).toBe(2);

    first();
    await queued;
    expect(order).toEqual(['third']);
    expect(gate.activeCount).toBe(2);
  });

  it('rejects a caller that waits past the bound instead of parking it', async () => {
    jest.useFakeTimers();
    const gate = new ConcurrencyGate(1, 1_000);
    await gate.acquire();

    const rejected = gate.acquire();
    const assertion = expect(rejected).rejects.toBeInstanceOf(
      ConcurrencyLimitError,
    );
    jest.advanceTimersByTime(1_000);
    await assertion;
    expect(gate.activeCount).toBe(1);
  });

  it('releases only once, however often the releaser is called', async () => {
    const gate = new ConcurrencyGate(1, 1_000);
    const release = await gate.acquire();

    release();
    release();

    expect(gate.activeCount).toBe(0);
  });

  it('admits waiting callers when the limit is raised', async () => {
    const gate = new ConcurrencyGate(1, 1_000);
    await gate.acquire();
    const queued = gate.acquire();

    gate.setLimit(2);

    await expect(queued).resolves.toBeInstanceOf(Function);
    expect(gate.activeCount).toBe(2);
  });
});
