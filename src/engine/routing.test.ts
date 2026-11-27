import { describe, expect, it } from 'vitest';
import { astar } from './astar';
import { dijkstra } from './dijkstra';
import { CongestionModel, FreeFlowCost } from './graph';
import { makeGraph, makeRandomGraph } from './test-helpers';

const NODES = [
  { id: 0, x: 0, y: 0 },
  { id: 1, x: 100, y: 0 },
  { id: 2, x: 100, y: 100 },
  { id: 3, x: 0, y: 100 },
  { id: 4, x: 200, y: 0 },
];

function bothWays(from: number, to: number, lengthM: number, speedKph: number) {
  return [
    { from, to, lengthM, speedKph, road: 'test' },
    { from: to, to: from, lengthM, speedKph, road: 'test' },
  ];
}

const EDGES = [
  ...bothWays(0, 1, 100, 36),
  ...bothWays(1, 2, 100, 36),
  ...bothWays(2, 3, 100, 36),
  ...bothWays(3, 0, 100, 36),
  ...bothWays(0, 2, Math.hypot(100, 100), 72),
  ...bothWays(1, 4, 100, 36),
];

describe('Dijkstra', () => {
  it('finds the known shortest route', () => {
    const graph = makeGraph(NODES, EDGES);
    const result = dijkstra(graph, 0, 4, new FreeFlowCost(graph));
    expect(Array.from(result.path)).toEqual([0, 1, 4]);
    expect(result.cost).toBeCloseTo(20, 9);
    expect(result.distanceM).toBeCloseTo(200, 6);
    expect(result.nodesExpanded).toBe(result.explored.length);
  });

  it('returns an empty route when the goal is unreachable', () => {
    const graph = makeGraph(
      [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 10, y: 0 },
      ],
      [{ from: 0, to: 1, lengthM: 10, speedKph: 36, road: 'test' }],
    );
    const result = dijkstra(graph, 1, 0, new FreeFlowCost(graph));
    expect(result.path.length).toBe(0);
    expect(result.cost).toBe(Infinity);
    expect(result.explored.length).toBe(1);
  });

  it('handles a start equal to the goal', () => {
    const graph = makeGraph(NODES, EDGES);
    const result = dijkstra(graph, 2, 2, new FreeFlowCost(graph));
    expect(Array.from(result.path)).toEqual([2]);
    expect(result.cost).toBe(0);
  });

  it('rejects out-of-range endpoints', () => {
    const graph = makeGraph(NODES, EDGES);
    expect(() => dijkstra(graph, -1, 2, new FreeFlowCost(graph))).toThrow(RangeError);
    expect(() => astar(graph, 0, 99, new FreeFlowCost(graph))).toThrow(RangeError);
  });
});

describe('A*', () => {
  it('returns the known shortest route', () => {
    const graph = makeGraph(NODES, EDGES);
    const result = astar(graph, 0, 4, new FreeFlowCost(graph));
    expect(Array.from(result.path)).toEqual([0, 1, 4]);
    expect(result.cost).toBeCloseTo(20, 9);
  });

  it('matches Dijkstra path cost on random graphs with load-sensitive costs', () => {
    const graph = makeRandomGraph(310, 70);
    const loads = new Float32Array(graph.edgeCount);
    for (let i = 0; i < loads.length; i += 1) loads[i] = ((i * 37) % 100) / 100;
    const model = new CongestionModel(graph, 0.35, loads);

    let dijkstraExpanded = 0;
    let astarExpanded = 0;
    for (let trial = 0; trial < 30; trial += 1) {
      const start = (trial * 17) % graph.nodeCount;
      const goal = (trial * 31 + 11) % graph.nodeCount;
      const d = dijkstra(graph, start, goal, model);
      const a = astar(graph, start, goal, model);
      expect(a.cost).toBeCloseTo(d.cost, 7);
      expect(a.path[0]).toBe(start);
      expect(a.path[a.path.length - 1]).toBe(goal);
      dijkstraExpanded += d.nodesExpanded;
      astarExpanded += a.nodesExpanded;
    }
    // The Euclidean heuristic should prune at least some of the search.
    expect(astarExpanded).toBeLessThan(dijkstraExpanded);
  });

  it('produces a route whose free-flow time is the sum of its edges', () => {
    const graph = makeRandomGraph(99, 40);
    const freeFlow = new FreeFlowCost(graph);
    const result = astar(graph, 0, 39, freeFlow);
    expect(result.cost).toBeCloseTo(result.freeFlowCost, 9);
  });
});
