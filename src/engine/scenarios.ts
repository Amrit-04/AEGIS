import seattleJson from '../../data/preset-city.json';
import mumbaiJson from '../../data/preset-city-mumbai.json';
import type { CityGraphData, CityMeta, FacilityData } from './types';
import { CityGraph } from './graph';
import { SeededRng } from './rng';

export type CitySource = 'preset' | 'mumbai' | 'grid';

const SEATTLE = seattleJson as unknown as CityGraphData;
const MUMBAI = mumbaiJson as unknown as CityGraphData;

export function getCityData(source: CitySource, seed: number): CityGraphData {
  if (source === 'preset') return SEATTLE;
  if (source === 'mumbai') return MUMBAI;
  return generateGridCity(seed);
}

/**
 * Procedural grid city. Jitter, arterial spacing, diagonal shortcuts and
 * facility positions are all derived from the seed; two runs with the same
 * seed are byte-for-byte identical.
 */
export function generateGridCity(seed: number): CityGraphData {
  const rng = new SeededRng(seed);
  const columns = 13;
  const rows = 11;
  const spacing = 112;
  const nodes: CityGraphData['nodes'] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column - (columns - 1) / 2) * spacing + rng.range(-12, 12);
      const y = (row - (rows - 1) / 2) * spacing + rng.range(-12, 12);
      nodes.push({ id: row * columns + column, x, y });
    }
  }

  const edges: CityGraphData['edges'] = [];
  const addEdge = (from: number, to: number, speedKph: number): void => {
    if (from === to) return;
    const a = nodes[from];
    const b = nodes[to];
    const lengthM = Math.hypot(a.x - b.x, a.y - b.y);
    if (lengthM < 1) return;
    edges.push({ from, to, lengthM, speedKph, road: speedKph >= 50 ? 'primary' : 'residential' });
  };
  const speedFor = (row: number, column: number): number =>
    row % 3 === 0 || column % 3 === 0 ? 50 : 30;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const node = row * columns + column;
      if (column + 1 < columns) {
        const east = node + 1;
        addEdge(node, east, speedFor(row, column));
        addEdge(east, node, speedFor(row, column));
      }
      if (row + 1 < rows) {
        const south = node + columns;
        addEdge(node, south, speedFor(row, column));
        addEdge(south, node, speedFor(row, column));
      }
      if (row + 1 < rows && column + 1 < columns && rng.chance(0.16)) {
        const diagonal = (row + 1) * columns + column + 1;
        addEdge(node, diagonal, 28);
        addEdge(diagonal, node, 28);
      }
    }
  }

  const facilityNode = (row: number, column: number): number => row * columns + column;
  const hospitals: FacilityData[] = [
    {
      name: 'Northside General',
      node: facilityNode(2, 1),
      capacity: 410,
    },
    {
      name: 'Eastgate Trauma Center',
      node: facilityNode(5, columns - 2),
      capacity: 320,
    },
  ];
  const shelters: FacilityData[] = [
    { name: 'Riverside School', node: facilityNode(1, 1), capacity: 760 },
    { name: 'Civic Arena', node: facilityNode(1, columns - 2), capacity: 900 },
    { name: 'South Commons', node: facilityNode(rows - 2, 1), capacity: 650 },
    { name: 'Hillcrest Gymnasium', node: facilityNode(rows - 2, columns - 2), capacity: 580 },
    { name: 'Central Library', node: facilityNode(5, 6), capacity: 420 },
  ];

  const roadM = edges.reduce((sum, edge) => sum + edge.lengthM, 0) / 2;
  const meta: CityMeta = {
    name: `Seeded grid · ${seed}`,
    source: 'Procedural',
    attribution: 'Procedurally generated grid city',
    generator: 'src/engine/scenarios.ts',
    nodeCount: nodes.length,
    edgeCount: edges.length,
    roadKm: Math.round((roadM / 1000) * 100) / 100,
  };

  return { meta, nodes, edges, hospitals, shelters };
}

/**
 * Deterministic civilian sample for canvas density rendering. Most points
 * cluster around civic facilities/downtown; the rest follow road edges. The
 * output is interleaved [x, y, x, y, ...] in a transfer-friendly typed array.
 */
export function samplePopulation(graph: CityGraph, count: number, seed: number): Float32Array {
  const rng = new SeededRng(seed ^ 0x9e3779b9);
  const result = new Float32Array(count * 2);
  const cumulative = new Float64Array(graph.edgeCount);
  let total = 0;
  for (let i = 0; i < graph.edgeCount; i += 1) {
    total += graph.edgeLengthM[i];
    cumulative[i] = total;
  }

  const center = graph.nearestNode(
    (graph.bounds.minX + graph.bounds.maxX) * 0.5,
    (graph.bounds.minY + graph.bounds.maxY) * 0.5,
  );
  const hotspots = [
    center,
    ...graph.hospitals.map((facility) => facility.node),
    ...graph.shelters.slice(0, 3).map((facility) => facility.node),
  ];

  for (let i = 0; i < count; i += 1) {
    let x: number;
    let y: number;
    if (rng.chance(0.66)) {
      const hotspot = rng.pick(hotspots);
      x = graph.nodeX[hotspot] + rng.gaussian() * 58;
      y = graph.nodeY[hotspot] + rng.gaussian() * 58;
    } else {
      const target = rng.next() * total;
      const edgeIndex = lowerBound(cumulative, target);
      const from = graph.edgeFrom[edgeIndex];
      const to = graph.edgeTo[edgeIndex];
      const t = rng.next();
      const dx = graph.nodeX[to] - graph.nodeX[from];
      const dy = graph.nodeY[to] - graph.nodeY[from];
      const length = Math.max(graph.edgeLengthM[edgeIndex], 1);
      const offset = rng.range(-13, 13);
      x = graph.nodeX[from] + dx * t + (-dy / length) * offset;
      y = graph.nodeY[from] + dy * t + (dx / length) * offset;
    }
    result[i * 2] = x;
    result[i * 2 + 1] = y;
  }
  return result;
}

/**
 * A synthetic, spatial rush-hour load field used to make stage 2's
 * load-sensitive routing visible before the flow simulation exists. Central
 * arterials load first; peripheral residential streets load last. Later stages
 * replace this with measured edge volumes.
 */
export function buildDemoLoadField(graph: CityGraph, intensity: number): Float32Array {
  const loads = new Float32Array(graph.edgeCount);
  const centerX = (graph.bounds.minX + graph.bounds.maxX) * 0.5;
  const centerY = (graph.bounds.minY + graph.bounds.maxY) * 0.5;
  const sigma = Math.max(
    240,
    Math.min(graph.bounds.maxX - graph.bounds.minX, graph.bounds.maxY - graph.bounds.minY) * 0.32,
  );
  const intensityClamped = Math.max(0, Math.min(1.2, intensity));

  for (let i = 0; i < graph.edgeCount; i += 1) {
    const dx = graph.edgeMidpointX(i) - centerX;
    const dy = graph.edgeMidpointY(i) - centerY;
    const core = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    const roadWeight = roadCongestionWeight(graph.edgeRoad[i]);
    loads[i] = intensityClamped * (0.24 + 0.76 * core) * roadWeight;
  }
  return loads;
}

function roadCongestionWeight(road: string): number {
  switch (road) {
    case 'motorway':
    case 'trunk':
      return 0.9;
    case 'primary':
      return 1;
    case 'secondary':
      return 0.88;
    case 'tertiary':
      return 0.76;
    case 'residential':
    case 'living_street':
      return 0.54;
    default:
      return 0.7;
  }
}

function lowerBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}
