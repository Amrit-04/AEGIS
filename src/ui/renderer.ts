import type { CityGraph } from '../engine/graph';
import type { Camera } from './camera';
import { createViewport } from './camera';

export type Accent = readonly [number, number, number];

export interface MapRenderOptions {
  graph: CityGraph;
  camera: Camera;
  width: number;
  height: number;
  population: Float32Array;
  explored?: Uint32Array;
  path?: Uint32Array;
  origin: number;
  destination: number;
  accent: Accent;
  showPopulation: boolean;
}

const TAU = Math.PI * 2;
const ROAD_STYLES = [
  { color: '#4b6c86', width: 1.35 },
  { color: '#3c5a72', width: 1.16 },
  { color: '#304b60', width: 0.9 },
  { color: '#2b4559', width: 0.72 },
] as const;

export function drawMap(context: CanvasRenderingContext2D, options: MapRenderOptions): void {
  const { graph, camera, width, height, accent } = options;
  const viewport = createViewport(graph, camera, width, height);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#07121b';
  context.fillRect(0, 0, width, height);

  drawWorldGrid(context, graph, viewport.scale, viewport.offsetX, viewport.offsetY, width, height);
  drawRoads(context, graph, viewport.scale, viewport.offsetX, viewport.offsetY);
  if (options.showPopulation) {
    drawPopulation(context, options.population, viewport.scale, viewport.offsetX, viewport.offsetY);
  }
  if (options.explored && options.explored.length > 0) {
    drawExplored(
      context,
      graph,
      options.explored,
      accent,
      viewport.scale,
      viewport.offsetX,
      viewport.offsetY,
    );
  }
  if (options.path && options.path.length > 1) {
    drawRoute(context, graph, options.path, accent, viewport.scale, viewport.offsetX, viewport.offsetY);
  }
  drawFacilities(context, graph, camera, viewport.scale, viewport.offsetX, viewport.offsetY);
  drawSelectionMarkers(
    context,
    graph,
    options.origin,
    options.destination,
    viewport.scale,
    viewport.offsetX,
    viewport.offsetY,
  );
  drawScaleBar(context, viewport.scale, width, height);
  drawAttribution(context, graph, width, height);
}

function drawWorldGrid(
  context: CanvasRenderingContext2D,
  graph: CityGraph,
  scale: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): void {
  const step = 250;
  const left = (0 - offsetX) / scale;
  const top = (0 - offsetY) / scale;
  const right = (width - offsetX) / scale;
  const bottom = (height - offsetY) / scale;
  context.beginPath();
  for (let x = Math.floor(left / step) * step; x <= right; x += step) {
    const screenX = x * scale + offsetX;
    context.moveTo(screenX, 0);
    context.lineTo(screenX, height);
  }
  for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
    const screenY = y * scale + offsetY;
    context.moveTo(0, screenY);
    context.lineTo(width, screenY);
  }
  context.strokeStyle = 'rgba(124, 185, 206, 0.035)';
  context.lineWidth = 1;
  context.stroke();

  // A subtle center marker gives the endless grid a spatial reference.
  const centerX = (graph.bounds.minX + graph.bounds.maxX) * 0.5;
  const centerY = (graph.bounds.minY + graph.bounds.maxY) * 0.5;
  context.beginPath();
  context.arc(centerX * scale + offsetX, centerY * scale + offsetY, 3, 0, TAU);
  context.fillStyle = 'rgba(124, 185, 206, 0.12)';
  context.fill();
}

function drawRoads(
  context: CanvasRenderingContext2D,
  graph: CityGraph,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const baseWidth = Math.min(7.6, Math.max(1.15, scale * 9.2));
  const edges = graph.renderEdges;

  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    const from = graph.edgeFrom[edge];
    const to = graph.edgeTo[edge];
    context.moveTo(graph.nodeX[from] * scale + offsetX, graph.nodeY[from] * scale + offsetY);
    context.lineTo(graph.nodeX[to] * scale + offsetX, graph.nodeY[to] * scale + offsetY);
  }
  context.strokeStyle = '#0b1721';
  context.lineWidth = baseWidth + 1.5;
  context.stroke();

  for (let group = 0; group < ROAD_STYLES.length; group += 1) {
    const style = ROAD_STYLES[group];
    context.beginPath();
    for (let i = 0; i < edges.length; i += 1) {
      const edge = edges[i];
      if (roadGroup(graph.edgeRoad[edge]) !== group) continue;
      const from = graph.edgeFrom[edge];
      const to = graph.edgeTo[edge];
      context.moveTo(graph.nodeX[from] * scale + offsetX, graph.nodeY[from] * scale + offsetY);
      context.lineTo(graph.nodeX[to] * scale + offsetX, graph.nodeY[to] * scale + offsetY);
    }
    context.strokeStyle = style.color;
    context.lineWidth = baseWidth * style.width;
    context.stroke();
  }
}

function roadGroup(road: string): number {
  if (road === 'motorway' || road === 'trunk' || road === 'motorway_link' || road === 'trunk_link') {
    return 0;
  }
  if (road === 'primary' || road === 'secondary') return 1;
  if (road.startsWith('primary_link') || road.startsWith('secondary_link')) return 3;
  return 2;
}

function drawPopulation(
  context: CanvasRenderingContext2D,
  population: Float32Array,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const size = Math.min(2.1, Math.max(0.9, scale * 2.3));
  context.fillStyle = 'rgba(244, 201, 126, 0.4)';
  for (let i = 0; i < population.length; i += 2) {
    context.fillRect(
      population[i] * scale + offsetX - size * 0.5,
      population[i + 1] * scale + offsetY - size * 0.5,
      size,
      size,
    );
  }
}

function drawExplored(
  context: CanvasRenderingContext2D,
  graph: CityGraph,
  explored: Uint32Array,
  accent: Accent,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const radius = Math.min(4.6, Math.max(1.8, scale * 5.4));
  const bucketSize = Math.max(1, Math.ceil(explored.length / 4));
  for (let bucket = 0; bucket < 4; bucket += 1) {
    const start = bucket * bucketSize;
    if (start >= explored.length) break;
    const end = Math.min(explored.length, start + bucketSize);
    context.beginPath();
    for (let i = start; i < end; i += 1) {
      const node = explored[i];
      const x = graph.nodeX[node] * scale + offsetX;
      const y = graph.nodeY[node] * scale + offsetY;
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, TAU);
    }
    context.fillStyle = rgba(accent, 0.29 + bucket * 0.1);
    context.fill();
  }
}

function drawRoute(
  context: CanvasRenderingContext2D,
  graph: CityGraph,
  path: Uint32Array,
  accent: Accent,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  traceRoute(context, graph, path, scale, offsetX, offsetY);
  context.strokeStyle = rgba(accent, 0.18);
  context.lineWidth = 11;
  context.stroke();
  traceRoute(context, graph, path, scale, offsetX, offsetY);
  context.strokeStyle = rgba(accent, 1);
  context.lineWidth = 2.6;
  context.stroke();
  traceRoute(context, graph, path, scale, offsetX, offsetY);
  context.strokeStyle = 'rgba(255, 255, 255, 0.58)';
  context.lineWidth = 0.8;
  context.stroke();
}

function traceRoute(
  context: CanvasRenderingContext2D,
  graph: CityGraph,
  path: Uint32Array,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  context.beginPath();
  const first = path[0];
  context.moveTo(graph.nodeX[first] * scale + offsetX, graph.nodeY[first] * scale + offsetY);
  for (let i = 1; i < path.length; i += 1) {
    const node = path[i];
    context.lineTo(graph.nodeX[node] * scale + offsetX, graph.nodeY[node] * scale + offsetY);
  }
}

function drawFacilities(
  context: CanvasRenderingContext2D,
  graph: CityGraph,
  camera: Camera,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const iconSize = Math.max(7, Math.min(13, scale * 16));
  for (const hospital of graph.hospitals) {
    const x = graph.nodeX[hospital.node] * scale + offsetX;
    const y = graph.nodeY[hospital.node] * scale + offsetY;
    context.fillStyle = '#ff667f';
    context.strokeStyle = 'rgba(7, 18, 27, 0.9)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(x - iconSize * 0.5, y - iconSize * 0.5, iconSize, iconSize, 2.5);
    context.fill();
    context.stroke();
    context.fillStyle = '#fff';
    const arm = iconSize * 0.18;
    context.fillRect(x - arm, y - iconSize * 0.3, arm * 2, iconSize * 0.6);
    context.fillRect(x - iconSize * 0.3, y - arm, iconSize * 0.6, arm * 2);
    if (camera.zoom > 1.2) {
      drawLabel(context, shortenName(hospital.name), x + iconSize * 0.8, y - 1, '#ffb3c0');
    }
  }

  for (const shelter of graph.shelters) {
    const x = graph.nodeX[shelter.node] * scale + offsetX;
    const y = graph.nodeY[shelter.node] * scale + offsetY;
    context.fillStyle = '#43e3b0';
    context.strokeStyle = 'rgba(7, 18, 27, 0.9)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x, y - iconSize * 0.62);
    context.lineTo(x + iconSize * 0.58, y + iconSize * 0.42);
    context.lineTo(x - iconSize * 0.58, y + iconSize * 0.42);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = '#07121b';
    context.beginPath();
    context.arc(x, y + iconSize * 0.08, iconSize * 0.13, 0, TAU);
    context.fill();
    if (camera.zoom > 1.45) {
      drawLabel(context, shortenName(shelter.name), x + iconSize * 0.7, y - 1, '#a7f3d0');
    }
  }
}

function drawSelectionMarkers(
  context: CanvasRenderingContext2D,
  graph: CityGraph,
  origin: number,
  destination: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const ox = graph.nodeX[origin] * scale + offsetX;
  const oy = graph.nodeY[origin] * scale + offsetY;
  const dx = graph.nodeX[destination] * scale + offsetX;
  const dy = graph.nodeY[destination] * scale + offsetY;

  context.beginPath();
  context.arc(ox, oy, 8, 0, TAU);
  context.strokeStyle = '#ffcf70';
  context.lineWidth = 2;
  context.stroke();
  context.beginPath();
  context.arc(dx, dy, 8, 0, TAU);
  context.strokeStyle = '#7dd3fc';
  context.lineWidth = 2;
  context.stroke();

  drawPill(context, 'START', ox, oy - 17, '#ffcf70');
  drawPill(context, 'SHELTER', dx, dy + 17, '#7dd3fc');
}

function drawPill(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  context.font = '600 8px "Segoe UI", system-ui, sans-serif';
  const width = context.measureText(text).width + 10;
  context.fillStyle = 'rgba(4, 12, 19, 0.82)';
  context.fillRect(x - width * 0.5, y - 7, width, 14);
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, x, y + 0.5);
}

function drawLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  context.font = '500 9.5px "Segoe UI", system-ui, sans-serif';
  const width = context.measureText(text).width;
  context.fillStyle = 'rgba(4, 12, 19, 0.76)';
  context.fillRect(x, y - 8, width + 8, 15);
  context.fillStyle = color;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(text, x + 4, y);
}

function drawScaleBar(
  context: CanvasRenderingContext2D,
  scale: number,
  width: number,
  height: number,
): void {
  const targetPx = Math.min(120, Math.max(64, width * 0.18));
  const meters = niceDistance(targetPx / scale);
  const pixels = meters * scale;
  const x = width - pixels - 18;
  const y = height - 24;
  context.strokeStyle = 'rgba(226, 242, 248, 0.72)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x, y - 4);
  context.lineTo(x, y);
  context.lineTo(x + pixels, y);
  context.lineTo(x + pixels, y - 4);
  context.stroke();
  context.fillStyle = 'rgba(226, 242, 248, 0.76)';
  context.font = '500 9px "Segoe UI", system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'bottom';
  context.fillText(formatDistance(meters), x, y - 6);
}

function drawAttribution(
  context: CanvasRenderingContext2D,
  graph: CityGraph,
  width: number,
  height: number,
): void {
  context.fillStyle = 'rgba(196, 221, 231, 0.5)';
  context.font = '500 8.5px "Segoe UI", system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  const label =
    graph.meta.source === 'OpenStreetMap'
      ? '© OpenStreetMap contributors · ODbL'
      : 'Procedural grid · seeded';
  context.fillText(label, 14, height - 10);
  context.textAlign = 'right';
  context.fillText('AEGIS', width - 14, height - 10);
}

function niceDistance(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const normalized = value / magnitude;
  const step = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return step * magnitude;
}

function formatDistance(meters: number): string {
  return meters >= 1_000 ? `${Math.round(meters / 1_000)} km` : `${Math.round(meters)} m`;
}

function shortenName(name: string): string {
  const cleaned = name
    .replace(' Hospital & Seattle Medical Center', ' Hospital')
    .replace('The Seattle Public Library - ', '')
    .replace(' Community Center', ' Ctr.')
    .replace('The ', '');
  return cleaned.length > 30 ? `${cleaned.slice(0, 28)}…` : cleaned;
}

function rgba(accent: Accent, alpha: number): string {
  return `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${alpha})`;
}
