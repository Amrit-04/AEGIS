import { describe, expect, it } from 'vitest';
import { SeededRng } from './rng';

describe('SeededRng', () => {
  it('is deterministic for the same seed', () => {
    const a = new SeededRng(2026);
    const b = new SeededRng(2026);
    const first = Array.from({ length: 12 }, () => a.next());
    const second = Array.from({ length: 12 }, () => b.next());
    expect(first).toEqual(second);
  });

  it('produces a different stream for a different seed', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('stays in range', () => {
    const rng = new SeededRng(77);
    for (let i = 0; i < 1_000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const integer = rng.int(9);
      expect(Number.isInteger(integer)).toBe(true);
      expect(integer).toBeGreaterThanOrEqual(0);
      expect(integer).toBeLessThan(9);
    }
  });

  it('has a roughly centered gaussian sample', () => {
    const rng = new SeededRng(42);
    let sum = 0;
    for (let i = 0; i < 5_000; i += 1) sum += rng.gaussian();
    expect(Math.abs(sum / 5_000)).toBeLessThan(0.08);
  });
});
