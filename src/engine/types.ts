export interface CityNodeData {
  id: number;
  x: number;
  y: number;
}

export interface CityEdgeData {
  from: number;
  to: number;
  lengthM: number;
  speedKph: number;
  road: string;
}

export interface FacilityData {
  name: string;
  node: number;
  capacity: number;
}

export interface CityMeta {
  name: string;
  source: string;
  sourceUrl?: string;
  license?: string;
  attribution: string;
  bbox?: [number, number, number, number];
  generatedAt?: string;
  generator?: string;
  nodeCount?: number;
  edgeCount?: number;
  roadKm?: number;
}

export interface CityGraphData {
  meta: CityMeta;
  nodes: CityNodeData[];
  edges: CityEdgeData[];
  hospitals: FacilityData[];
  shelters: FacilityData[];
}

export interface RouteResult {
  /** Node indices from start to goal. Empty when no route exists. */
  path: Uint32Array;
  /** Settled node indices in expansion order. */
  explored: Uint32Array;
  /** Generalized travel cost in seconds. Infinity when unreachable. */
  cost: number;
  /** Free-flow travel time in seconds, before congestion. */
  freeFlowCost: number;
  distanceM: number;
  nodesExpanded: number;
}

/**
 * Edge costs may depend on the arrival time at the edge. Implementations must
 * be FIFO: leaving later can never arrive earlier. This keeps Dijkstra and A*
 * correct when the network is re-costed between runs.
 */
export interface TravelTimeModel {
  edgeCost(edgeIndex: number, arrivalTime: number): number;
}

export interface GraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
