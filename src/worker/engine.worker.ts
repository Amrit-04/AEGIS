/// <reference lib="webworker" />

import { astar } from '../engine/astar';
import { dijkstra } from '../engine/dijkstra';
import { CityGraph, CongestionModel } from '../engine/graph';
import { buildDemoLoadField } from '../engine/scenarios';
import type { WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

let graph: CityGraph | undefined;
let graphVersion = -1;

scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      graph = CityGraph.fromData(message.graph);
      graphVersion = message.graphVersion;
      post({
        type: 'ready',
        graphVersion,
        nodeCount: graph.nodeCount,
        edgeCount: graph.edgeCount,
      });
      return;
    }

    if (message.type === 'compare') {
      if (!graph || message.graphVersion !== graphVersion) {
        post({
          type: 'error',
          requestId: message.requestId,
          graphVersion: message.graphVersion,
          message: 'Graph is not ready for this comparison',
        });
        return;
      }

      const loads = buildDemoLoadField(graph, message.load);
      const costModel = new CongestionModel(graph, 0, loads);

      let started = performance.now();
      const dijkstraResult = dijkstra(graph, message.from, message.to, costModel);
      const dijkstraMs = performance.now() - started;

      started = performance.now();
      const astarResult = astar(graph, message.from, message.to, costModel);
      const astarMs = performance.now() - started;

      const results = [
        { algorithm: 'dijkstra' as const, result: dijkstraResult, runtimeMs: dijkstraMs },
        { algorithm: 'astar' as const, result: astarResult, runtimeMs: astarMs },
      ].map(({ algorithm, result, runtimeMs }) => ({
        algorithm,
        path: result.path,
        explored: result.explored,
        cost: result.cost,
        freeFlowCost: result.freeFlowCost,
        distanceM: result.distanceM,
        nodesExpanded: result.nodesExpanded,
        runtimeMs,
      }));

      const transfer: Transferable[] = [];
      for (const result of results) {
        transfer.push(result.path.buffer, result.explored.buffer);
      }
      post(
        {
          type: 'comparison',
          requestId: message.requestId,
          graphVersion,
          load: message.load,
          results,
        },
        transfer,
      );
    }
  } catch (error) {
    post({
      type: 'error',
      requestId: message.type === 'compare' ? message.requestId : undefined,
      graphVersion,
      message: error instanceof Error ? error.message : 'Unknown worker error',
    });
  }
});

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}
