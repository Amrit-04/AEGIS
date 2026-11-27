import { CityGraph } from './graph';
import type { CityEdgeData, CityGraphData, CityNodeData } from './types';
import { SeededRng } from './rng';

export function makeGraph(nodes: CityNodeData[], edges: CityEdgeData[]): CityGraph {
  const data: CityGraphData = {
    meta: {
      name: 'test',
      source: 'test',
      attribution: 'test',
    },
    nodes,
    edges,
    hospitals: [{ name: 'Hospital', node: 0, capacity: 10 }],
    shelters: [{ name: 'Shelter', node: nodes.length - 1, capacity: 100 }],
  };
  return CityGraph.fromData(data);
}

export function makeRandomGraph(seed: number, nodeCount = 60): CityGraph {
  const rng = new SeededRng(seed);
  const nodes: CityNodeData[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: index,
    x: rng.range(0, 1_000),
    y: rng.range(0, 1_000),
  }));
  const edges: CityEdgeData[] = [];
  const add = (from: number, to: number): void => {
    const a = nodes[from];
    const b = nodes[to];
    edges.push({
      from,
      to,
      lengthM: Math.hypot(a.x - b.x, a.y - b.y),
      speedKph: rng.range(20, 75),
      road: 'test',
    });
  };

  // A bidirectional ring guarantees strong connectivity. Random chords create
  // many competing routes for the Dijkstra/A* equivalence check.
  for (let i = 0; i < nodeCount; i += 1) {
    const next = (i + 1) % nodeCount;
    add(i, next);
    add(next, i);
  }
  for (let i = 0; i < nodeCount * 3; i += 1) {
    const from = rng.int(nodeCount);
    const to = rng.int(nodeCount);
    if (from !== to) add(from, to);
  }

  return makeGraph(nodes, edges);
}
