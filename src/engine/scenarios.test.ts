import { describe, expect, it } from 'vitest';
import { CityGraph, FreeFlowCost } from './graph';
import { dijkstra } from './dijkstra';
import {
  buildDemoLoadField,
  generateGridCity,
  getCityData,
  samplePopulation,
} from './scenarios';

describe('scenario generation', () => {
  it('generates a deterministic city for a fixed seed', () => {
    expect(generateGridCity(42)).toEqual(generateGridCity(42));
    expect(generateGridCity(42)).not.toEqual(generateGridCity(43));
  });

  it('produces a connected grid with valid facility anchors', () => {
    const graph = CityGraph.fromData(generateGridCity(7));
    const model = new FreeFlowCost(graph);
    for (let node = 1; node < graph.nodeCount; node += 1) {
      const route = dijkstra(graph, 0, node, model);
      expect(Number.isFinite(route.cost)).toBe(true);
    }
    for (const facility of [...graph.hospitals, ...graph.shelters]) {
      expect(facility.node).toBeGreaterThanOrEqual(0);
      expect(facility.node).toBeLessThan(graph.nodeCount);
      expect(facility.capacity).toBeGreaterThan(0);
    }
  });

  it('loads the committed OpenStreetMap preset with facilities', () => {
    const data = getCityData('preset', 0);
    const graph = CityGraph.fromData(data);
    expect(graph.meta.source).toBe('OpenStreetMap');
    expect(graph.nodeCount).toBeGreaterThan(1_000);
    expect(graph.hospitals.length).toBeGreaterThanOrEqual(2);
    expect(graph.shelters.length).toBeGreaterThanOrEqual(3);
  });

  it('creates deterministic population samples as interleaved typed arrays', () => {
    const graph = CityGraph.fromData(generateGridCity(9));
    const first = samplePopulation(graph, 2_000, 123);
    const second = samplePopulation(graph, 2_000, 123);
    expect(first).toBeInstanceOf(Float32Array);
    expect(first.length).toBe(4_000);
    expect(Array.from(first)).toEqual(Array.from(second));
    for (const value of first) expect(Number.isFinite(value)).toBe(true);
  });

  it('creates zero load at zero intensity and bounded positive load otherwise', () => {
    const graph = CityGraph.fromData(generateGridCity(11));
    const zero = buildDemoLoadField(graph, 0);
    expect(Array.from(zero).every((value) => value === 0)).toBe(true);
    const busy = buildDemoLoadField(graph, 1);
    let positive = 0;
    for (const value of busy) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1.2);
      if (value > 0) positive += 1;
    }
    expect(positive).toBeGreaterThan(graph.edgeCount / 2);
  });
});
