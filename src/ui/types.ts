import type { RouteSummary } from '../worker/protocol';

export interface Comparison {
  results: RouteSummary[];
  load: number;
  graphVersion: number;
}

export type PickMode = 'origin' | 'destination' | null;
export type WorkerState = 'starting' | 'ready' | 'error';
