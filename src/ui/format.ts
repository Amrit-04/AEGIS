export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value < 1) return `${(value * 1_000).toFixed(0)} µs`;
  if (value < 10) return `${value.toFixed(2)} ms`;
  return `${value.toFixed(1)} ms`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'unreachable';
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '' : '−'}${Math.abs(value).toFixed(0)}%`;
}
