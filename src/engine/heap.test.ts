import { describe, expect, it } from 'vitest';
import { BinaryHeap } from './heap';

describe('BinaryHeap', () => {
  it('pops values in ascending key order', () => {
    const heap = new BinaryHeap(4);
    const entries = [
      [8, 3],
      [3, 8],
      [1, 9],
      [5, 7],
      [2, 6],
      [8, 1],
      [0, 0],
    ] as const;
    for (const [key, value] of entries) heap.push(key, value);

    const keyOf = new Map<number, number>();
    for (const [key, value] of entries) keyOf.set(value, key);

    const popped: number[] = [];
    while (heap.size > 0) popped.push(heap.pop());

    const poppedKeys = popped.map((value) => keyOf.get(value));
    expect(poppedKeys).toEqual([0, 1, 2, 3, 5, 8, 8]);
  });

  it('grows beyond its initial capacity', () => {
    const heap = new BinaryHeap(1);
    for (let i = 0; i < 500; i += 1) heap.push(500 - i, i);
    for (let i = 0; i < 500; i += 1) {
      expect(heap.pop()).toBe(499 - i);
    }
    expect(heap.size).toBe(0);
  });

  it('throws when empty', () => {
    const heap = new BinaryHeap();
    expect(() => heap.pop()).toThrow(/empty/);
    expect(() => heap.peekKey()).toThrow(/empty/);
  });
});
