import { BinaryHeap } from './heap';
import type { CityGraph } from './graph';
import { buildRouteResult } from './route-utils';
import type { RouteResult, TravelTimeModel } from './types';

/**
 * Dijkstra's algorithm with a binary heap and lazy duplicate entries.
 *
 * Invariant: when a node is popped it has the smallest tentative distance of
 * all unsettled nodes, and because every edge cost is non-negative that
 * distance is final. Costs are evaluated at the arrival time, which is why the
 * model is required to be FIFO.
 */
export function dijkstra(
  graph: CityGraph,
  start: number,
  goal: number,
  costModel: TravelTimeModel,
): RouteResult {
  validateEndpoints(graph, start, goal);
  const nodeCount = graph.nodeCount;
  const distance = new Float64Array(nodeCount);
  distance.fill(Infinity);
  const previousNode = new Int32Array(nodeCount);
  previousNode.fill(-1);
  const previousEdge = new Int32Array(nodeCount);
  previousEdge.fill(-1);
  const settled = new Uint8Array(nodeCount);
  const explored = new Uint32Array(nodeCount);
  let exploredCount = 0;

  const heap = new BinaryHeap(Math.max(64, nodeCount));
  distance[start] = 0;
  heap.push(0, start);

  while (heap.size > 0) {
    const node = heap.pop();
    if (settled[node]) continue;
    settled[node] = 1;
    explored[exploredCount] = node;
    exploredCount += 1;

    if (node === goal) {
      return buildRouteResult(
        graph,
        previousNode,
        previousEdge,
        start,
        goal,
        explored,
        exploredCount,
        distance[goal],
      );
    }

    const nodeDistance = distance[node];
    for (let k = graph.adjacencyOffset[node]; k < graph.adjacencyOffset[node + 1]; k += 1) {
      const edgeIndex = graph.adjacencyEdges[k];
      const next = graph.edgeTo[edgeIndex];
      if (settled[next]) continue;
      const candidate = nodeDistance + costModel.edgeCost(edgeIndex, nodeDistance);
      if (candidate < distance[next]) {
        distance[next] = candidate;
        previousNode[next] = node;
        previousEdge[next] = edgeIndex;
        heap.push(candidate, next);
      }
    }
  }

  return buildRouteResult(
    graph,
    previousNode,
    previousEdge,
    start,
    goal,
    explored,
    exploredCount,
    Infinity,
  );
}

export function validateEndpoints(graph: CityGraph, start: number, goal: number): void {
  if (!Number.isInteger(start) || start < 0 || start >= graph.nodeCount) {
    throw new RangeError(`Start node ${start} is outside the graph`);
  }
  if (!Number.isInteger(goal) || goal < 0 || goal >= graph.nodeCount) {
    throw new RangeError(`Goal node ${goal} is outside the graph`);
  }
}
