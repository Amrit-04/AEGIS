/**
 * Indexed min-heap with lazy duplicate entries. The heap only stores a key and
 * a caller-owned integer payload; graph algorithms validate stale payloads via
 * their distance array, so an explicit decrease-key operation is unnecessary.
 *
 * Invariant: for every element at index i, key[parent(i)] <= key[i].
 */
export class BinaryHeap {
  private keys: Float64Array;
  private values: Uint32Array;
  private count = 0;

  constructor(initialCapacity = 1_024) {
    if (initialCapacity < 1) throw new Error('Heap capacity must be positive');
    this.keys = new Float64Array(initialCapacity);
    this.values = new Uint32Array(initialCapacity);
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.count = 0;
  }

  push(key: number, value: number): void {
    if (this.count === this.keys.length) this.grow();
    let index = this.count;
    this.keys[index] = key;
    this.values[index] = value;
    this.count += 1;
    this.bubbleUp(index);
  }

  pop(): number {
    if (this.count === 0) throw new Error('Cannot pop from an empty heap');
    const root = this.values[0];
    this.count -= 1;
    if (this.count > 0) {
      this.keys[0] = this.keys[this.count];
      this.values[0] = this.values[this.count];
      this.bubbleDown(0);
    }
    return root;
  }

  peekKey(): number {
    if (this.count === 0) throw new Error('Cannot peek an empty heap');
    return this.keys[0];
  }

  private grow(): void {
    const nextCapacity = this.keys.length * 2;
    const nextKeys = new Float64Array(nextCapacity);
    const nextValues = new Uint32Array(nextCapacity);
    nextKeys.set(this.keys);
    nextValues.set(this.values);
    this.keys = nextKeys;
    this.values = nextValues;
  }

  private bubbleUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.keys[parent] <= this.keys[index]) return;
      this.swap(index, parent);
      index = parent;
    }
  }

  private bubbleDown(start: number): void {
    let index = start;
    for (;;) {
      const left = index * 2 + 1;
      if (left >= this.count) return;
      const right = left + 1;
      const smallest =
        right < this.count && this.keys[right] < this.keys[left] ? right : left;
      if (this.keys[index] <= this.keys[smallest]) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const key = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = key;
    const value = this.values[a];
    this.values[a] = this.values[b];
    this.values[b] = value;
  }
}
