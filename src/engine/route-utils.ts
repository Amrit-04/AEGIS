import type { CityGraph } from './graph';
import type { RouteResult } from './types';

/**
 * Shared route reconstruction for Dijkstra and A*.
 *
 * The predecessor arrays are only read after a goal has been settled, so every
 * node on the predecessor chain is guaranteed to have a finite distance.
 */
export function buildRouteResult(
  graph: CityGraph,
  previousNode: Int32Array,
  previousEdge: Int32Array,
  start: number,
  goal: number,
  explored: Uint32Array,
  exploredCount: number,
  cost: number,
): RouteResult {
  if (!Number.isFinite(cost)) {
    return {
      path: new Uint32Array(0),
      explored: explored.subarray(0, exploredCount),
      cost: Infinity,
      freeFlowCost: 0,
      distanceM: 0,
      nodesExpanded: exploredCount,
    };
  }

  let pathLength = 1;
  for (let node = goal; node !== start; node = previousNode[node]) {
    if (node < 0 || pathLength > graph.nodeCount) {
      throw new Error('Corrupt predecessor chain');
    }
    pathLength += 1;
  }

  const path = new Uint32Array(pathLength);
  let cursor = goal;
  for (let i = pathLength - 1; i >= 0; i -= 1) {
    path[i] = cursor;
    cursor = previousNode[cursor];
  }

  let distanceM = 0;
  let freeFlowCost = 0;
  for (let i = 1; i < path.length; i += 1) {
    const edgeIndex = previousEdge[path[i]];
    distanceM += graph.edgeLengthM[edgeIndex];
    freeFlowCost += graph.edgeBaseTimeSec[edgeIndex];
  }

  return {
    path,
    explored: explored.subarray(0, exploredCount),
    cost,
    freeFlowCost,
    distanceM,
    nodesExpanded: exploredCount,
  };
}
