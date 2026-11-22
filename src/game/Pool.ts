/**
 * A tiny object pool: `acquire` reuses a released object (after `reset`) or makes a new one. The
 * scene pools its sprites and popup texts with it so a long run creates and destroys almost no
 * game objects after the first few seconds (less garbage collection on phones).
 */
export class Pool<T> {
  private free: T[] = [];
  /** How many objects were ever created (never decreases). */
  created = 0;

  constructor(
    private make: () => T,
    private reset: (item: T) => void = () => {},
    private park: (item: T) => void = () => {},
    /** At most this many idle objects are kept; extras go to `drop`. */
    private maxIdle = 64,
    private drop: (item: T) => void = () => {},
  ) {}

  acquire(): T {
    const item = this.free.pop();
    if (item !== undefined) {
      this.reset(item);
      return item;
    }
    this.created++;
    const fresh = this.make();
    this.reset(fresh);
    return fresh;
  }

  release(item: T): void {
    if (this.free.includes(item)) return; // double release is harmless
    if (this.free.length >= this.maxIdle) {
      this.drop(item);
      return;
    }
    this.park(item);
    this.free.push(item);
  }

  get idle(): number {
    return this.free.length;
  }
}
