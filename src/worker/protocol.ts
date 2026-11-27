import type { CityGraphData } from '../engine/types';

export type RouteAlgorithm = 'dijkstra' | 'astar';

export interface RouteSummary {
  algorithm: RouteAlgorithm;
  path: Uint32Array;
  explored: Uint32Array;
  cost: number;
  freeFlowCost: number;
  distanceM: number;
  nodesExpanded: number;
  runtimeMs: number;
}

export type WorkerRequest =
  | {
      type: 'init';
      graphVersion: number;
      graph: CityGraphData;
    }
  | {
      type: 'compare';
      requestId: number;
      graphVersion: number;
      from: number;
      to: number;
      load: number;
    };

export type WorkerResponse =
  | {
      type: 'ready';
      graphVersion: number;
      nodeCount: number;
      edgeCount: number;
    }
  | {
      type: 'comparison';
      requestId: number;
      graphVersion: number;
      load: number;
      results: RouteSummary[];
    }
  | {
      type: 'error';
      requestId?: number;
      graphVersion?: number;
      message: string;
    };
