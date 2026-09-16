/**
 * FIFO permit gate bounding how many operations may run at once.
 *
 * Waiting is bounded on purpose: a caller that cannot get a permit within `maxWaitMs` is
 * rejected instead of parked forever, so a saturated shared provider key produces a clear
 * rate-limit error rather than an unbounded queue (SPEC-0012/FR-011).
 *
 * In-memory, per process, like the other guards in this directory. Deliberately not
 * @Injectable: it takes constructor primitives, which Nest cannot resolve.
 */
export class ConcurrencyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyLimitError';
  }
}

type Waiter = {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class ConcurrencyGate {
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    private limit: number,
    private readonly maxWaitMs: number,
  ) {}

  /** The facilitator may raise or lower the limit while requests are in flight. */
  setLimit(limit: number): void {
    this.limit = limit;
    this.drain();
  }

  get activeCount(): number {
    return this.active;
  }

  acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(waiter);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(
            new ConcurrencyLimitError(
              'The deployment is at its concurrent provider request limit.',
            ),
          );
        }, this.maxWaitMs),
      };
      this.waiting.push(waiter);
    });
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.drain();
    };
  }

  private drain(): void {
    while (this.active < this.limit && this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      clearTimeout(waiter.timer);
      this.active += 1;
      waiter.resolve(this.releaser());
    }
  }
}
