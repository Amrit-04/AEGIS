import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CityGraph } from '../engine/graph';
import {
  getCityData,
  samplePopulation,
  type CitySource,
} from '../engine/scenarios';
import { fitCamera, type Camera } from './camera';
import { ControlPanel } from './ControlPanel';
import { MapCanvas } from './MapCanvas';
import { MetricsPanel } from './MetricsPanel';
import type { Accent } from './renderer';
import type { RouteSummary, WorkerRequest, WorkerResponse } from '../worker/protocol';
import type { Comparison, PickMode, WorkerState } from './types';
import { formatMs } from './format';

const CIVILIAN_COUNT = 2_000;
const DIJKSTRA_ACCENT: Accent = [255, 180, 84];
const ASTAR_ACCENT: Accent = [94, 234, 212];
const DEFAULT_SEED = 2027;

export function App() {
  const [source, setSource] = useState<CitySource>('preset');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [camera, setCamera] = useState<Camera>({ cx: 0, cy: 0, zoom: 1 });
  const [origin, setOrigin] = useState(0);
  const [destination, setDestination] = useState(1);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [load, setLoad] = useState(0.58);
  const [showPopulation, setShowPopulation] = useState(true);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [running, setRunning] = useState(false);
  const [workerState, setWorkerState] = useState<WorkerState>('starting');
  const [workerError, setWorkerError] = useState('');
  const [runToken, setRunToken] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const graphVersionRef = useRef(0);
  const requestIdRef = useRef(0);
  const latestRequestRef = useRef(0);

  const city = useMemo(() => {
    const data = getCityData(source, seed);
    return { data, graph: CityGraph.fromData(data) };
  }, [source, seed]);

  const population = useMemo(
    () =>
      samplePopulation(
        city.graph,
        CIVILIAN_COUNT,
        source === 'preset' ? 0xa3615 : source === 'mumbai' ? 0x9b42c : seed * 17 + 3,
      ),
    [city.graph, seed, source],
  );

  useEffect(() => {
    const worker = new Worker(new URL('../worker/engine.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'ready') {
        if (message.graphVersion === graphVersionRef.current) {
          setWorkerState('ready');
          setWorkerError('');
        }
        return;
      }
      if (message.type === 'comparison') {
        if (
          message.graphVersion !== graphVersionRef.current ||
          message.requestId !== latestRequestRef.current
        ) {
          return;
        }
        setComparison({
          results: message.results,
          load: message.load,
          graphVersion: message.graphVersion,
        });
        setRunning(false);
        setWorkerState('ready');
        return;
      }
      if (
        message.requestId !== undefined &&
        message.requestId !== latestRequestRef.current
      ) {
        return;
      }
      setWorkerError(message.message);
      setRunning(false);
      setWorkerState('error');
    };

    worker.onerror = (event) => {
      setWorkerError(event.message || 'The engine worker crashed.');
      setRunning(false);
      setWorkerState('error');
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const version = graphVersionRef.current + 1;
    graphVersionRef.current = version;
    latestRequestRef.current = ++requestIdRef.current;
    setWorkerState('starting');
    setWorkerError('');
    setComparison(null);
    setRunning(false);
    setCamera(fitCamera(city.graph));
    const start = city.graph.hospitals[0]?.node ?? 0;
    setOrigin(start);
    setDestination(farthestShelter(city.graph, start));
    setPickMode(null);
    const request: WorkerRequest = {
      type: 'init',
      graphVersion: version,
      graph: city.data,
    };
    workerRef.current?.postMessage(request);
  }, [city]);

  useEffect(() => {
    if (workerState !== 'ready' || origin === destination) return;
    const requestId = ++requestIdRef.current;
    latestRequestRef.current = requestId;
    const timer = window.setTimeout(() => {
      setComparison(null);
      setRunning(true);
      const request: WorkerRequest = {
        type: 'compare',
        requestId,
        graphVersion: graphVersionRef.current,
        from: origin,
        to: destination,
        load,
      };
      workerRef.current?.postMessage(request);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [workerState, origin, destination, load, city.graph, runToken]);

  const handleNodePick = (node: number) => {
    if (pickMode === 'origin') {
      setOrigin(node);
      setPickMode(null);
    } else if (pickMode === 'destination') {
      setDestination(node);
      setPickMode(null);
    }
  };

  const invalidateResults = () => {
    graphVersionRef.current += 1;
    latestRequestRef.current = ++requestIdRef.current;
    setComparison(null);
    setRunning(false);
    setWorkerState('starting');
    setPickMode(null);
  };

  const handleSourceChange = (next: CitySource) => {
    if (next === source) return;
    invalidateResults();
    setSource(next);
  };

  const handleSeedChange = (next: number) => {
    if (next === seed) return;
    invalidateResults();
    setSeed(next);
  };

  const activeComparison =
    comparison && comparison.graphVersion === graphVersionRef.current ? comparison : null;
  const dijkstraResult = activeComparison?.results.find(
    (result) => result.algorithm === 'dijkstra',
  );
  const astarResult = activeComparison?.results.find((result) => result.algorithm === 'astar');
  const safeOrigin =
    origin >= 0 && origin < city.graph.nodeCount
      ? origin
      : (city.graph.hospitals[0]?.node ?? 0);
  const safeDestination =
    destination >= 0 && destination < city.graph.nodeCount
      ? destination
      : (city.graph.shelters[0]?.node ?? Math.max(0, city.graph.nodeCount - 1));

  return (
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <BrandMark />
          <div class="brand-copy">
            <h1>AEGIS</h1>
            <p>Urban evacuation &amp; emergency logistics lab</p>
          </div>
        </div>
        <div class="topbar-meta">
          <span class="browser-badge">
            <span class="status-dot" aria-hidden="true" />
            in-browser engine
          </span>
          <span class="stage-chip">STAGE 02 / ROUTING</span>
        </div>
      </header>

      <main class="workspace">
        <section class="map-stage" aria-labelledby="race-title">
          <div class="map-stage-head">
            <div>
              <p class="eyebrow">Algorithm race</p>
              <h2 id="race-title">Same city. Same costs. Different search strategies.</h2>
              <p class="dataset-line">
                <strong>{city.graph.meta.name}</strong>
                <span aria-hidden="true">·</span>
                {city.graph.meta.nodeCount} nodes
                <span aria-hidden="true">·</span>
                {city.graph.meta.edgeCount} directed links
                <span aria-hidden="true">·</span>
                {city.graph.meta.roadKm} road-km
              </p>
            </div>
            <div class="legend" aria-label="Map legend">
              <span>
                <i class="legend-dot legend-dot--amber" aria-hidden="true" />
                Dijkstra expansion
              </span>
              <span>
                <i class="legend-dot legend-dot--cyan" aria-hidden="true" />
                A* expansion
              </span>
              <span>
                <i class="legend-line" aria-hidden="true" />
                optimal route
              </span>
              <span>
                <i class="legend-dot legend-dot--people" aria-hidden="true" />
                civilians
              </span>
            </div>
          </div>

          <div class="map-panes">
            <AlgorithmPane
              tone="dijkstra"
              title="Dijkstra"
              subtitle="uninformed search"
              accent={DIJKSTRA_ACCENT}
              result={dijkstraResult}
              running={running}
              graph={city.graph}
              camera={camera}
              population={population}
              origin={safeOrigin}
              destination={safeDestination}
              showPopulation={showPopulation}
              onCameraChange={setCamera}
              onNodePick={handleNodePick}
            />
            <AlgorithmPane
              tone="astar"
              title="A*"
              subtitle="Euclidean heuristic"
              accent={ASTAR_ACCENT}
              result={astarResult}
              running={running}
              graph={city.graph}
              camera={camera}
              population={population}
              origin={safeOrigin}
              destination={safeDestination}
              showPopulation={showPopulation}
              onCameraChange={setCamera}
              onNodePick={handleNodePick}
            />
          </div>

          <div class="map-foot">
            <p>
              <span class="key">drag</span> pan
              <span class="key-sep">/</span>
              <span class="key">scroll</span> zoom
              <span class="key-sep">/</span>
              <span class="key">click node</span>
              set active endpoint
            </p>
            <p class="map-foot-right">
              Dots are settlement order · same shared camera · 60 fps canvas
            </p>
          </div>
        </section>

        <aside class="sidebar">
          <ControlPanel
            source={source}
            seed={seed}
            graph={city.graph}
            origin={safeOrigin}
            destination={safeDestination}
            pickMode={pickMode}
            load={load}
            showPopulation={showPopulation}
            running={running}
            workerState={workerState}
            onSourceChange={handleSourceChange}
            onSeedChange={handleSeedChange}
            onOriginChange={setOrigin}
            onDestinationChange={setDestination}
            onPickModeChange={setPickMode}
            onLoadChange={setLoad}
            onShowPopulationChange={setShowPopulation}
            onFitCamera={() => setCamera(fitCamera(city.graph))}
            onRun={() => setRunToken((value) => value + 1)}
          />
          <MetricsPanel
            comparison={activeComparison}
            running={running}
            workerState={workerState}
            workerError={workerError}
          />
        </aside>
      </main>

      <footer class="page-foot">
        <p>
          Built with Preact, Canvas 2D and hand-written TypeScript algorithms. Routing runs in a
          worker; visualizations stream back as transferable typed arrays.
        </p>
        <p>
          {city.graph.meta.source === 'OpenStreetMap'
            ? 'Map data © OpenStreetMap contributors, ODbL 1.0.'
            : 'Procedural city generated locally. No map data.'}
        </p>
      </footer>
    </div>
  );
}

interface AlgorithmPaneProps {
  tone: 'dijkstra' | 'astar';
  title: string;
  subtitle: string;
  accent: Accent;
  result: RouteSummary | undefined;
  running: boolean;
  graph: CityGraph;
  camera: Camera;
  population: Float32Array;
  origin: number;
  destination: number;
  showPopulation: boolean;
  onCameraChange: (camera: Camera) => void;
  onNodePick: (node: number) => void;
}

function AlgorithmPane(props: AlgorithmPaneProps) {
  return (
    <article class={`pane pane--${props.tone}`}>
      <header class="pane-head">
        <div class="pane-title-group">
          <span class="pane-accent" aria-hidden="true" />
          <div>
            <h3>{props.title}</h3>
            <p>{props.subtitle}</p>
          </div>
        </div>
        <div class="pane-stat" aria-live="polite">
          {props.result ? (
            <>
              <strong>{props.result.nodesExpanded.toLocaleString('en-US')}</strong>
              <span>nodes</span>
              <span class="pane-runtime">{formatMs(props.result.runtimeMs)}</span>
            </>
          ) : (
            <span class="pane-waiting">{props.running ? 'searching…' : 'waiting'}</span>
          )}
        </div>
      </header>
      <div class="canvas-wrap">
        <MapCanvas
          graph={props.graph}
          camera={props.camera}
          accent={props.accent}
          population={props.population}
          origin={props.origin}
          destination={props.destination}
          explored={props.result?.explored}
          path={props.result?.path}
          showPopulation={props.showPopulation}
          label={`${props.title} route map`}
          onCameraChange={props.onCameraChange}
          onNodePick={props.onNodePick}
        />
      </div>
    </article>
  );
}

function BrandMark() {
  return (
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 44" role="presentation">
        <path d="M20 2 37 8v12c0 10.9-6.9 18.1-17 22C9.9 38.1 3 30.9 3 20V8Z" />
        <path class="brand-mark-road" d="M20 9v22M13 20h14" />
      </svg>
    </span>
  );
}

function farthestShelter(graph: CityGraph, origin: number): number {
  let best = graph.shelters[0]?.node ?? Math.max(0, graph.nodeCount - 1);
  let bestDistance = -1;
  for (const shelter of graph.shelters) {
    const distance = graph.euclideanDistance(origin, shelter.node);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = shelter.node;
    }
  }
  return best;
}
