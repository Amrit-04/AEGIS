import type {
  CityEdgeData,
  CityGraphData,
  FacilityData,
  GraphBounds,
  TravelTimeModel,
} from './types';

/**
 * Immutable, array-backed road graph.
 *
 * Construction converts the portable JSON graph into typed arrays and a CSR
 * adjacency list once per scenario. Rendering and every algorithm then work
 * without per-frame object allocation.
 */
export class CityGraph {
  readonly meta: CityGraphData['meta'];
  readonly hospitals: readonly FacilityData[];
  readonly shelters: readonly FacilityData[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodeIds: Float64Array;
  readonly nodeX: Float64Array;
  readonly nodeY: Float64Array;
  readonly edgeFrom: Uint32Array;
  readonly edgeTo: Uint32Array;
  readonly edgeLengthM: Float64Array;
  readonly edgeSpeedKph: Float64Array;
  readonly edgeBaseTimeSec: Float64Array;
  readonly edgeRoad: string[];
  readonly adjacencyOffset: Uint32Array;
  readonly adjacencyEdges: Uint32Array;
  readonly renderEdges: Uint32Array;
  readonly bounds: GraphBounds;
  readonly maxSpeedMps: number;

  private constructor(data: CityGraphData) {
    validateGraphData(data);
    this.meta = data.meta;
    this.hospitals = data.hospitals;
    this.shelters = data.shelters;
    this.nodeCount = data.nodes.length;
    this.edgeCount = data.edges.length;

    this.nodeIds = new Float64Array(this.nodeCount);
    this.nodeX = new Float64Array(this.nodeCount);
    this.nodeY = new Float64Array(this.nodeCount);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < this.nodeCount; i += 1) {
      const node = data.nodes[i];
      this.nodeIds[i] = node.id;
      this.nodeX[i] = node.x;
      this.nodeY[i] = node.y;
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;
    }
    this.bounds = { minX, minY, maxX, maxY };

    this.edgeFrom = new Uint32Array(this.edgeCount);
    this.edgeTo = new Uint32Array(this.edgeCount);
    this.edgeLengthM = new Float64Array(this.edgeCount);
    this.edgeSpeedKph = new Float64Array(this.edgeCount);
    this.edgeBaseTimeSec = new Float64Array(this.edgeCount);
    this.edgeRoad = new Array<string>(this.edgeCount);
    let maxSpeedMps = 0;

    for (let i = 0; i < this.edgeCount; i += 1) {
      const edge = data.edges[i];
      this.edgeFrom[i] = edge.from;
      this.edgeTo[i] = edge.to;
      this.edgeLengthM[i] = edge.lengthM;
      this.edgeSpeedKph[i] = edge.speedKph;
      const speedMps = edge.speedKph / 3.6;
      this.edgeBaseTimeSec[i] = edge.lengthM / speedMps;
      this.edgeRoad[i] = edge.road;
      if (speedMps > maxSpeedMps) maxSpeedMps = speedMps;
    }
    this.maxSpeedMps = maxSpeedMps;

    const degree = new Uint32Array(this.nodeCount);
    for (let i = 0; i < this.edgeCount; i += 1) {
      degree[this.edgeFrom[i]] += 1;
    }
    this.adjacencyOffset = new Uint32Array(this.nodeCount + 1);
    for (let i = 0; i < this.nodeCount; i += 1) {
      this.adjacencyOffset[i + 1] = this.adjacencyOffset[i] + degree[i];
    }
    this.adjacencyEdges = new Uint32Array(this.edgeCount);
    const cursor = this.adjacencyOffset.slice(0, this.nodeCount);
    for (let i = 0; i < this.edgeCount; i += 1) {
      const from = this.edgeFrom[i];
      this.adjacencyEdges[cursor[from]] = i;
      cursor[from] += 1;
    }

    // A two-way chain is represented by two directed edges. Draw only one of
    // each pair, while retaining one-way edges in their permitted direction.
    const render: number[] = [];
    for (let i = 0; i < this.edgeCount; i += 1) {
      const from = this.edgeFrom[i];
      const to = this.edgeTo[i];
      if (from === to) continue;
      if (from < to) {
        render.push(i);
        continue;
      }
      let hasReverse = false;
      for (let k = this.adjacencyOffset[to]; k < this.adjacencyOffset[to + 1]; k += 1) {
        if (this.edgeTo[this.adjacencyEdges[k]] === from) {
          hasReverse = true;
          break;
        }
      }
      if (!hasReverse) render.push(i);
    }
    this.renderEdges = Uint32Array.from(render);
  }

  static fromData(data: CityGraphData): CityGraph {
    return new CityGraph(data);
  }

  euclideanDistance(a: number, b: number): number {
    const dx = this.nodeX[a] - this.nodeX[b];
    const dy = this.nodeY[a] - this.nodeY[b];
    return Math.sqrt(dx * dx + dy * dy);
  }

  nearestNode(x: number, y: number): number {
    let best = 0;
    let bestSquared = Infinity;
    for (let i = 0; i < this.nodeCount; i += 1) {
      const dx = this.nodeX[i] - x;
      const dy = this.nodeY[i] - y;
      const squared = dx * dx + dy * dy;
      if (squared < bestSquared) {
        bestSquared = squared;
        best = i;
      }
    }
    return best;
  }

  edgeMidpointX(edgeIndex: number): number {
    return (this.nodeX[this.edgeFrom[edgeIndex]] + this.nodeX[this.edgeTo[edgeIndex]]) * 0.5;
  }

  edgeMidpointY(edgeIndex: number): number {
    return (this.nodeY[this.edgeFrom[edgeIndex]] + this.nodeY[this.edgeTo[edgeIndex]]) * 0.5;
  }
}

/**
 * Static free-flow costs. Useful as a baseline and in tests.
 */
export class FreeFlowCost implements TravelTimeModel {
  constructor(private readonly graph: CityGraph) {}

  edgeCost(edgeIndex: number): number {
    return this.graph.edgeBaseTimeSec[edgeIndex];
  }
}

/**
 * BPR-inspired congestion model inspired by the Bureau of Public Roads curve.
 *
 * Cost is free-flow time multiplied by 1 + 2.4·load³. The curve is deliberately
 * aggressive for visual legibility, not calibrated traffic engineering. Loads
 * can be supplied per edge by a simulation; the global load acts as a floor so
 * the UI slider always affects every road.
 *
 * Invariant: the multiplier is >= 1 and independent of travel history, so every
 * edge cost is at least free-flow time. The Euclidean/max-speed heuristic used
 * by A* is therefore admissible and consistent.
 */
export class CongestionModel implements TravelTimeModel {
  private readonly graph: CityGraph;
  readonly globalLoad: number;
  private readonly edgeLoads: Float32Array | undefined;

  constructor(graph: CityGraph, globalLoad: number, edgeLoads?: Float32Array) {
    this.graph = graph;
    this.globalLoad = clamp(globalLoad, 0, 1.25);
    this.edgeLoads = edgeLoads;
  }

  edgeCost(edgeIndex: number, _arrivalTime = 0): number {
    const localLoad = this.edgeLoads?.[edgeIndex] ?? 0;
    const load = clamp(Math.max(this.globalLoad, localLoad), 0, 1.25);
    const multiplier = 1 + 2.4 * load * load * load;
    return this.graph.edgeBaseTimeSec[edgeIndex] * multiplier;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validateGraphData(data: CityGraphData): void {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('City graph must contain nodes and edges');
  }
  if (data.nodes.length < 2) throw new Error('City graph needs at least two nodes');
  if (data.edges.length === 0) throw new Error('City graph needs at least one edge');

  for (let i = 0; i < data.nodes.length; i += 1) {
    const node = data.nodes[i];
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      throw new Error(`Node ${i} has invalid coordinates`);
    }
  }

  const nodeCount = data.nodes.length;
  for (let i = 0; i < data.edges.length; i += 1) {
    const edge = data.edges[i];
    if (!isNodeIndex(edge.from, nodeCount) || !isNodeIndex(edge.to, nodeCount)) {
      throw new Error(`Edge ${i} references a missing node`);
    }
    if (!Number.isFinite(edge.lengthM) || edge.lengthM <= 0) {
      throw new Error(`Edge ${i} has an invalid length`);
    }
    if (!Number.isFinite(edge.speedKph) || edge.speedKph <= 0) {
      throw new Error(`Edge ${i} has an invalid speed`);
    }
  }

  for (const facility of [...data.hospitals, ...data.shelters]) {
    if (!isNodeIndex(facility.node, nodeCount)) {
      throw new Error(`Facility "${facility.name}" references a missing node`);
    }
    if (!Number.isFinite(facility.capacity) || facility.capacity < 0) {
      throw new Error(`Facility "${facility.name}" has an invalid capacity`);
    }
  }
}

function isNodeIndex(value: number, nodeCount: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < nodeCount;
}

export type { CityEdgeData };
