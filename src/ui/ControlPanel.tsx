import type { CityGraph } from '../engine/graph';
import type { CitySource } from '../engine/scenarios';
import type { PickMode, WorkerState } from './types';

interface ControlPanelProps {
  source: CitySource;
  seed: number;
  graph: CityGraph;
  origin: number;
  destination: number;
  pickMode: PickMode;
  load: number;
  showPopulation: boolean;
  running: boolean;
  workerState: WorkerState;
  onSourceChange: (source: CitySource) => void;
  onSeedChange: (seed: number) => void;
  onOriginChange: (node: number) => void;
  onDestinationChange: (node: number) => void;
  onPickModeChange: (mode: PickMode) => void;
  onLoadChange: (load: number) => void;
  onShowPopulationChange: (show: boolean) => void;
  onFitCamera: () => void;
  onRun: () => void;
}

export function ControlPanel(props: ControlPanelProps) {
  const { graph } = props;
  const isCustomOrigin = !graph.hospitals.some((hospital) => hospital.node === props.origin);
  const isCustomDestination = !graph.shelters.some(
    (shelter) => shelter.node === props.destination,
  );

  return (
    <section class="panel controls-panel" aria-labelledby="controls-title">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Experiment setup</p>
          <h2 id="controls-title">Route lab</h2>
        </div>
        <span class={`status-chip status-chip--${props.workerState}`}>
          <span class="status-dot" aria-hidden="true" />
          {props.workerState === 'ready'
            ? 'worker ready'
            : props.workerState === 'starting'
              ? 'building'
              : 'error'}
        </span>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>City</span>
          <select
            value={props.source}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'preset' || value === 'mumbai' || value === 'grid') props.onSourceChange(value);
            }}
          >
            <option value="preset">Seattle · First Hill</option>
            <option value="mumbai">Mumbai · Fort</option>
            <option value="grid">Procedural grid</option>
          </select>
        </label>

        <label class={`field${props.source === 'preset' ? ' field--muted' : ''}`}>
          <span>Seed</span>
          <input
            type="number"
            min="1"
            max="999999"
            step="1"
            value={props.seed}
            disabled={props.source === 'preset'}
            onInput={(event) => {
              const value = Number.parseInt(event.currentTarget.value, 10);
              if (Number.isFinite(value) && value > 0) {
                props.onSeedChange(Math.min(999_999, value));
              }
            }}
          />
        </label>
      </div>

      <p class="field-note">
        {props.source === 'preset'
          ? 'Seattle real streets from OpenStreetMap, contracted to intersections.'
          : props.source === 'mumbai'
            ? 'Mumbai real streets (Fort / Nariman Point) from OpenStreetMap.'
            : 'Seeded jitter, arterial spacing and shortcuts. Same seed, same city.'}
      </p>

      <div class="field-grid">
        <label class="field">
          <span>Evacuation origin</span>
          <select
            value={props.origin}
            onChange={(event) => props.onOriginChange(Number(event.currentTarget.value))}
          >
            {isCustomOrigin && <option value={props.origin}>Road node #{props.origin}</option>}
            {graph.hospitals.map((hospital) => (
              <option key={hospital.name} value={hospital.node}>
                {hospital.name}
              </option>
            ))}
          </select>
        </label>

        <label class="field">
          <span>Shelter destination</span>
          <select
            value={props.destination}
            onChange={(event) => props.onDestinationChange(Number(event.currentTarget.value))}
          >
            {isCustomDestination && (
              <option value={props.destination}>Road node #{props.destination}</option>
            )}
            {graph.shelters.map((shelter) => (
              <option key={shelter.name} value={shelter.node}>
                {shelter.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div class="pick-row" role="group" aria-label="Pick route endpoint on the map">
        <span class="pick-label">Pick on map</span>
        <div class="segmented">
          <button
            type="button"
            class={props.pickMode === 'origin' ? 'is-active' : ''}
            aria-pressed={props.pickMode === 'origin'}
            onClick={() =>
              props.onPickModeChange(props.pickMode === 'origin' ? null : 'origin')
            }
          >
            Start
          </button>
          <button
            type="button"
            class={props.pickMode === 'destination' ? 'is-active' : ''}
            aria-pressed={props.pickMode === 'destination'}
            onClick={() =>
              props.onPickModeChange(
                props.pickMode === 'destination' ? null : 'destination',
              )
            }
          >
            Destination
          </button>
        </div>
      </div>

      <label class="slider-field">
        <span class="slider-head">
          <span>Rush-hour load</span>
          <strong>{Math.round(props.load * 100)}%</strong>
        </span>
        <input
          type="range"
          min="0"
          max="1.15"
          step="0.01"
          value={props.load}
          onInput={(event) => props.onLoadChange(Number(event.currentTarget.value))}
          aria-describedby="load-help"
        />
        <span id="load-help" class="field-note">
          Congestion field: central arterials load first. Cost = free-flow × (1 + 2.4·load³).
        </span>
      </label>

      <div class="toggle-row">
        <label class="toggle">
          <input
            type="checkbox"
            checked={props.showPopulation}
            onChange={(event) => props.onShowPopulationChange(event.currentTarget.checked)}
          />
          <span class="toggle-track" aria-hidden="true" />
          <span>2,000 civilian sample</span>
        </label>
        <button type="button" class="ghost-button" onClick={props.onFitCamera}>
          Fit view
        </button>
      </div>

      <button
        type="button"
        class="primary-button"
        onClick={props.onRun}
        disabled={props.running || props.workerState !== 'ready'}
      >
        {props.running ? (
          <>
            <span class="spinner" aria-hidden="true" />
            Searching in worker…
          </>
        ) : (
          <>
            <span class="button-icon" aria-hidden="true">
              ↯
            </span>
            Run race again
          </>
        )}
      </button>

      <p class="shortcut-note">
        Auto-runs on change. Map: drag / scroll / pinch · keyboard: arrows, +/−, Home.
      </p>
    </section>
  );
}
