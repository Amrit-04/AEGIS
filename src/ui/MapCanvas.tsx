import { useEffect, useRef, useState } from 'preact/hooks';
import type { CityGraph } from '../engine/graph';
import {
  createViewport,
  fitCamera,
  screenToWorld,
  zoomAt,
  type Camera,
} from './camera';
import { drawMap, type Accent } from './renderer';

interface MapCanvasProps {
  graph: CityGraph;
  camera: Camera;
  accent: Accent;
  population: Float32Array;
  origin: number;
  destination: number;
  explored?: Uint32Array;
  path?: Uint32Array;
  showPopulation: boolean;
  label: string;
  onCameraChange: (camera: Camera) => void;
  onNodePick: (node: number) => void;
}

interface PointerPoint {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  camera: Camera;
  moved: boolean;
}

interface PinchState {
  distance: number;
  startZoom: number;
  anchorX: number;
  anchorY: number;
}

export function MapCanvas(props: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(props.camera);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const dragRef = useRef<DragState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);

  cameraRef.current = props.camera;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(size.width * dpr);
    const pixelHeight = Math.round(size.height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(context, {
      graph: props.graph,
      camera: props.camera,
      width: size.width,
      height: size.height,
      population: props.population,
      explored: props.explored,
      path: props.path,
      origin: props.origin,
      destination: props.destination,
      accent: props.accent,
      showPopulation: props.showPopulation,
    });
  }, [
    props.graph,
    props.camera,
    props.population,
    props.explored,
    props.path,
    props.origin,
    props.destination,
    props.accent,
    props.showPopulation,
    size,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const current = cameraRef.current;
      const viewport = createViewport(props.graph, current, rect.width, rect.height);
      const factor = Math.exp(-event.deltaY * 0.0014);
      props.onCameraChange(zoomAt(viewport, x, y, current.zoom * factor));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [props.graph, props.onCameraChange]);

  const localPoint = (event: PointerEvent): PointerPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const handlePointerDown = (event: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      const viewport = createViewport(props.graph, cameraRef.current, size.width, size.height);
      const middleX = (points[0].x + points[1].x) * 0.5;
      const middleY = (points[0].y + points[1].y) * 0.5;
      const anchor = screenToWorld(viewport, middleX, middleY);
      pinchRef.current = {
        distance: Math.max(1, distance(points[0], points[1])),
        startZoom: cameraRef.current.zoom,
        anchorX: anchor.x,
        anchorY: anchor.y,
      };
      dragRef.current = null;
      setDragging(true);
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      camera: cameraRef.current,
      moved: false,
    };
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);

    if (pinchRef.current && pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      const middleX = (points[0].x + points[1].x) * 0.5;
      const middleY = (points[0].y + points[1].y) * 0.5;
      const zoom = clamp(
        pinchRef.current.startZoom * (distance(points[0], points[1]) / pinchRef.current.distance),
        0.85,
        18,
      );
      const viewport = createViewport(props.graph, cameraRef.current, size.width, size.height);
      const scale = viewport.fitScale * zoom;
      props.onCameraChange({
        cx: pinchRef.current.anchorX - (middleX - size.width * 0.5) / scale,
        cy: pinchRef.current.anchorY - (middleY - size.height * 0.5) / scale,
        zoom,
      });
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 3) {
      drag.moved = true;
      setDragging(true);
    }
    if (!drag.moved) return;
    const viewport = createViewport(props.graph, drag.camera, size.width, size.height);
    props.onCameraChange({
      cx: drag.camera.cx - dx / viewport.scale,
      cy: drag.camera.cy - dy / viewport.scale,
      zoom: drag.camera.zoom,
    });
  };

  const handlePointerUp = (event: PointerEvent) => {
    const wasPinching = pinchRef.current !== null;
    const drag = dragRef.current;
    pointersRef.current.delete(event.pointerId);
    canvasRef.current?.releasePointerCapture(event.pointerId);

    if (wasPinching) {
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
        dragRef.current = null;
        setDragging(false);
      }
      return;
    }

    if (drag && drag.pointerId === event.pointerId && !drag.moved) {
      pickNode(event);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const handlePointerCancel = (event: PointerEvent) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    dragRef.current = null;
    setDragging(false);
  };

  const pickNode = (event: PointerEvent) => {
    const point = localPoint(event);
    const viewport = createViewport(props.graph, cameraRef.current, size.width, size.height);
    const world = screenToWorld(viewport, point.x, point.y);
    const node = props.graph.nearestNode(world.x, world.y);
    const screenX = props.graph.nodeX[node] * viewport.scale + viewport.offsetX;
    const screenY = props.graph.nodeY[node] * viewport.scale + viewport.offsetY;
    if (Math.hypot(screenX - point.x, screenY - point.y) <= 24) {
      props.onNodePick(node);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const current = cameraRef.current;
    const viewport = createViewport(props.graph, current, size.width, size.height);
    const panPixels = 46;
    let next: Camera | null = null;
    if (event.key === 'ArrowLeft') {
      next = { ...current, cx: current.cx - panPixels / viewport.scale };
    } else if (event.key === 'ArrowRight') {
      next = { ...current, cx: current.cx + panPixels / viewport.scale };
    } else if (event.key === 'ArrowUp') {
      next = { ...current, cy: current.cy - panPixels / viewport.scale };
    } else if (event.key === 'ArrowDown') {
      next = { ...current, cy: current.cy + panPixels / viewport.scale };
    } else if (event.key === '+' || event.key === '=') {
      next = zoomAt(viewport, size.width / 2, size.height / 2, current.zoom * 1.28);
    } else if (event.key === '-' || event.key === '_') {
      next = zoomAt(viewport, size.width / 2, size.height / 2, current.zoom / 1.28);
    } else if (event.key === 'Home' || event.key === '0') {
      next = fitCamera(props.graph);
    }
    if (next) {
      event.preventDefault();
      props.onCameraChange(next);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      class={`map-canvas${dragging ? ' is-dragging' : ''}`}
      role="application"
      tabIndex={0}
      aria-label={`${props.label}. Drag to pan, scroll or pinch to zoom, arrow keys to pan, plus and minus to zoom, Home to fit. Click a node to use it as the active origin or destination.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    />
  );
}

function distance(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
