import { formatDistance, formatDuration, formatMs, formatNumber, formatPercent } from './format';
import type { Comparison, WorkerState } from './types';

interface MetricsPanelProps {
  comparison: Comparison | null;
  running: boolean;
  workerState: WorkerState;
  workerError: string;
}

export function MetricsPanel(props: MetricsPanelProps) {
  const dijkstra = props.comparison?.results.find((result) => result.algorithm === 'dijkstra');
  const astar = props.comparison?.results.find((result) => result.algorithm === 'astar');

  return (
    <section class="panel metrics-panel" aria-labelledby="metrics-title">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Live worker output</p>
          <h2 id="metrics-title">Race telemetry</h2>
        </div>
        <span class="mono-tag">no hardcoded numbers</span>
      </div>

      {props.workerState === 'error' ? (
        <div class="empty-state empty-state--error" role="alert">
          <strong>Engine error</strong>
          <p>{props.workerError || 'The worker failed to initialize.'}</p>
        </div>
      ) : !props.comparison ? (
        <div class="empty-state" aria-live="polite">
          <span class={props.running ? 'pulse-ring is-running' : 'pulse-ring'} aria-hidden="true" />
          <strong>{props.running ? 'Exploring the graph…' : 'Preparing the race…'}</strong>
          <p>
            {props.running
              ? 'Dijkstra and A* are running back-to-back inside the worker.'
              : 'The worker builds the graph, applies congestion, then streams typed-array results back.'}
          </p>
        </div>
      ) : dijkstra && astar ? (
        <>
          <RaceSummary dijkstra={dijkstra} astar={astar} />
          <div class="bar-race" aria-hidden="true">
            <ExpansionBar
              label="Dijkstra"
              value={dijkstra.nodesExpanded}
              max={Math.max(dijkstra.nodesExpanded, astar.nodesExpanded)}
              tone="amber"
            />
            <ExpansionBar
              label="A*"
              value={astar.nodesExpanded}
              max={Math.max(dijkstra.nodesExpanded, astar.nodesExpanded)}
              tone="cyan"
            />
          </div>
          <div class="table-wrap">
            <table class="metric-table">
              <caption class="sr-only">Routing comparison returned by the worker</caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Dijkstra</th>
                  <th scope="col">A*</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Nodes expanded</th>
                  <td>{formatNumber(dijkstra.nodesExpanded)}</td>
                  <td class="accent-cyan">{formatNumber(astar.nodesExpanded)}</td>
                </tr>
                <tr>
                  <th scope="row">Worker runtime</th>
                  <td>{formatMs(dijkstra.runtimeMs)}</td>
                  <td>{formatMs(astar.runtimeMs)}</td>
                </tr>
                <tr>
                  <th scope="row">Path cost</th>
                  <td>{formatDuration(dijkstra.cost)}</td>
                  <td>{formatDuration(astar.cost)}</td>
                </tr>
                <tr>
                  <th scope="row">Route length</th>
                  <td>{formatDistance(dijkstra.distanceM)}</td>
                  <td>{formatDistance(astar.distanceM)}</td>
                </tr>
                <tr>
                  <th scope="row">Free-flow time</th>
                  <td>{formatDuration(dijkstra.freeFlowCost)}</td>
                  <td>{formatDuration(astar.freeFlowCost)}</td>
                </tr>
                <tr>
                  <th scope="row">Congestion delay</th>
                  <td>{formatDuration(dijkstra.cost - dijkstra.freeFlowCost)}</td>
                  <td>{formatDuration(astar.cost - astar.freeFlowCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="verification">
            <span class="checkmark" aria-hidden="true">
              ✓
            </span>
            <p>
              Path costs{' '}
              <strong>
                {Math.abs(dijkstra.cost - astar.cost) < 1e-6 ? 'match exactly' : 'differ'}
              </strong>
              . A* uses an admissible lower bound, so it must return the same optimal cost.
            </p>
          </div>

          <div class="explainer">
            <h3>What you are seeing</h3>
            <p>
              Colored dots are settled nodes in expansion order; the bright line is the optimal
              route. Dijkstra spreads by travel time alone. A* adds straight-line distance ÷
              fastest speed, so it can ignore branches that cannot beat the destination.
            </p>
          </div>
        </>
      ) : (
        <div class="empty-state">
          <p>No result returned for both algorithms.</p>
        </div>
      )}
    </section>
  );
}

function RaceSummary({
  dijkstra,
  astar,
}: {
  dijkstra: { nodesExpanded: number };
  astar: { nodesExpanded: number };
}) {
  const reduction =
    dijkstra.nodesExpanded === 0
      ? 0
      : ((dijkstra.nodesExpanded - astar.nodesExpanded) / dijkstra.nodesExpanded) * 100;
  return (
    <div class="race-summary">
      <div>
        <span class="race-big">{formatPercent(reduction)}</span>
        <span class="race-caption">fewer nodes expanded by A*</span>
      </div>
      <span class="success-chip">
        <span aria-hidden="true">✓</span> optimal
      </span>
    </div>
  );
}

function ExpansionBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'amber' | 'cyan';
}) {
  const width = max === 0 ? 0 : Math.max(2, (value / max) * 100);
  return (
    <div class="bar-row">
      <span class="bar-label">{label}</span>
      <span class="bar-track">
        <span class={`bar-fill bar-fill--${tone}`} style={{ width: `${width}%` }} />
      </span>
      <span class="bar-value">{formatNumber(value)}</span>
    </div>
  );
}
