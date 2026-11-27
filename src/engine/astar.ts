import { BinaryHeap } from './heap';
import type { CityGraph } from './graph';
import { buildRouteResult } from './route-utils';
import { validateEndpoints } from './dijkstra';
import type { RouteResult, TravelTimeModel } from './types';

/**
 * A* with the Euclidean straight-line distance divided by the graph's fastest
 * speed as an admissible heuristic.
 *
 * Why it is consistent: every edge cost is at least length / maxSpeed and
 * straight-line distance satisfies the triangle inequality. Therefore
 * h(u) <= cost(u,v,t) + h(v), so a node never needs to be reopened once closed.
 */
export function astar(
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
  const closed = new Uint8Array(nodeCount);
  const explored = new Uint32Array(nodeCount);
  let exploredCount = 0;

  const heuristic = (node: number): number => {
    if (graph.maxSpeedMps <= 0) return 0;
    return graph.euclideanDistance(node, goal) / graph.maxSpeedMps;
  };

  const heap = new BinaryHeap(Math.max(64, nodeCount));
  distance[start] = 0;
  heap.push(heuristic(start), start);

  while (heap.size > 0) {
    const node = heap.pop();
    if (closed[node]) continue;
    closed[node] = 1;
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
      if (closed[next]) continue;
      const candidate = nodeDistance + costModel.edgeCost(edgeIndex, nodeDistance);
      if (candidate < distance[next]) {
        distance[next] = candidate;
        previousNode[next] = node;
        previousEdge[next] = edgeIndex;
        heap.push(candidate + heuristic(next), next);
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
