import type { CityGraph } from '../engine/graph';

export interface Camera {
  /** World-space center x. */
  cx: number;
  /** World-space center y. */
  cy: number;
  /** Multiplier relative to the graph-fit scale. */
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
  fitScale: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const MIN_ZOOM = 0.85;
export const MAX_ZOOM = 18;
const FIT_PADDING_PX = 42;

export function fitCamera(graph: CityGraph): Camera {
  return {
    cx: (graph.bounds.minX + graph.bounds.maxX) * 0.5,
    cy: (graph.bounds.minY + graph.bounds.maxY) * 0.5,
    zoom: 1,
  };
}

export function createViewport(
  graph: CityGraph,
  camera: Camera,
  width: number,
  height: number,
): Viewport {
  const graphWidth = Math.max(1, graph.bounds.maxX - graph.bounds.minX);
  const graphHeight = Math.max(1, graph.bounds.maxY - graph.bounds.minY);
  const availableWidth = Math.max(40, width - FIT_PADDING_PX * 2);
  const availableHeight = Math.max(40, height - FIT_PADDING_PX * 2);
  const fitScale = Math.min(availableWidth / graphWidth, availableHeight / graphHeight);
  const scale = fitScale * camera.zoom;
  return {
    width,
    height,
    fitScale,
    scale,
    offsetX: width * 0.5 - camera.cx * scale,
    offsetY: height * 0.5 - camera.cy * scale,
  };
}

export function screenToWorld(
  viewport: Viewport,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  return {
    x: (screenX - viewport.offsetX) / viewport.scale,
    y: (screenY - viewport.offsetY) / viewport.scale,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Camera update that keeps a fixed world point under a screen point. */
export function zoomAt(
  viewport: Viewport,
  screenX: number,
  screenY: number,
  nextZoom: number,
): Camera {
  const world = screenToWorld(viewport, screenX, screenY);
  const zoom = clampZoom(nextZoom);
  const scale = viewport.fitScale * zoom;
  return {
    cx: world.x - (screenX - viewport.width * 0.5) / scale,
    cy: world.y - (screenY - viewport.height * 0.5) / scale,
    zoom,
  };
}
