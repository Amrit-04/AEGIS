import { describe, expect, it } from 'vitest';
import { CityGraph, CongestionModel, FreeFlowCost } from './graph';
import { makeGraph } from './test-helpers';

const nodes = [
  { id: 0, x: 0, y: 0 },
  { id: 1, x: 100, y: 0 },
  { id: 2, x: 100, y: 100 },
];
const edges = [
  { from: 0, to: 1, lengthM: 100, speedKph: 36, road: 'primary' },
  { from: 1, to: 0, lengthM: 100, speedKph: 36, road: 'primary' },
  { from: 1, to: 2, lengthM: 100, speedKph: 36, road: 'residential' },
  { from: 2, to: 1, lengthM: 100, speedKph: 36, road: 'residential' },
  { from: 0, to: 2, lengthM: 140, speedKph: 18, road: 'tertiary' },
];

describe('CityGraph', () => {
  it('builds typed arrays, bounds and adjacency offsets', () => {
    const graph = makeGraph(nodes, edges);
    expect(graph.nodeCount).toBe(3);
    expect(graph.edgeCount).toBe(5);
    expect(graph.bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    expect(graph.maxSpeedMps).toBeCloseTo(10, 9);
    expect(graph.adjacencyOffset[0]).toBe(0);
    expect(graph.adjacencyOffset[graph.nodeCount]).toBe(5);
    expect(graph.edgeBaseTimeSec[0]).toBeCloseTo(10, 9);
  });

  it('deduplicates two-way edges for rendering but keeps one-way roads', () => {
    const graph = makeGraph(nodes, edges);
    expect(Array.from(graph.renderEdges).sort((a, b) => a - b)).toEqual([0, 2, 4]);
  });

  it('finds the nearest node', () => {
    const graph = makeGraph(nodes, edges);
    expect(graph.nearestNode(4, 3)).toBe(0);
    expect(graph.nearestNode(95, 95)).toBe(2);
  });

  it('rejects structurally invalid graphs', () => {
    expect(() =>
      CityGraph.fromData({
        meta: { name: 'bad', source: 'test', attribution: 'test' },
        nodes,
        edges: [{ from: 0, to: 99, lengthM: 1, speedKph: 30, road: 'test' }],
        hospitals: [],
        shelters: [],
      }),
    ).toThrow(/missing node/);
  });

  it('increases cost monotonically with congestion', () => {
    const graph = makeGraph(nodes, edges);
    const freeFlow = new FreeFlowCost(graph);
    const light = new CongestionModel(graph, 0.3);
    const heavy = new CongestionModel(graph, 1);
    for (let edge = 0; edge < graph.edgeCount; edge += 1) {
      expect(light.edgeCost(edge)).toBeGreaterThan(freeFlow.edgeCost(edge));
      expect(heavy.edgeCost(edge)).toBeGreaterThan(light.edgeCost(edge));
    }
  });

  it('honours per-edge loads and clamps the multiplier', () => {
    const graph = makeGraph(nodes, edges);
    const loads = new Float32Array(graph.edgeCount);
    loads[0] = 1.5;
    const model = new CongestionModel(graph, 0, loads);
    expect(model.edgeCost(0)).toBeGreaterThan(model.edgeCost(1));
    expect(model.edgeCost(0) / graph.edgeBaseTimeSec[0]).toBeCloseTo(1 + 2.4 * 1.25 ** 3, 9);
  });
});
