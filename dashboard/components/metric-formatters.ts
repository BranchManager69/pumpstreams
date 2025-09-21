const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function formatMagnitude(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return integerFormatter.format(Math.round(value));
}

export function formatMetric(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return formatMagnitude(value);
}

export function formatUsdCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const formatted = formatMagnitude(value);
  return value >= 0 ? `$${formatted}` : `-$${formatted.slice(1)}`;
}

export function formatViewerCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1_000) {
    return integerFormatter.format(Math.round(value));
  }
  return formatMagnitude(value);
}

export function formatAge(ageSeconds: number | null, offsetSeconds = 0): string {
  if (ageSeconds === null || !Number.isFinite(ageSeconds)) return '—';
  const total = Math.max(0, Math.floor(ageSeconds + offsetSeconds));
  if (total < 60) return `${total}s ago`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatCountdown(seconds: number | null, offsetSeconds = 0): string {
  if (seconds === null || !Number.isFinite(seconds)) return '0s';
  const remaining = Math.max(0, Math.floor(seconds - offsetSeconds));
  if (remaining <= 0) return '0s';
  if (remaining < 60) return `${remaining}s`;
  const minutes = Math.floor(remaining / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

export function formatMarketUsd(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) {
    return '—';
  }
  return formatUsdCompact(usd);
}

export function calculateViewersPerThousandUsd(
  usdAmount: number | null,
  viewerCount: number | null,
): number | null {
  if (
    usdAmount === null ||
    viewerCount === null ||
    !Number.isFinite(usdAmount) ||
    !Number.isFinite(viewerCount) ||
    usdAmount <= 0
  ) {
    return null;
  }
  return (viewerCount / usdAmount) * 1_000;
}

export function formatViewersPerThousandUsd(
  usdAmount: number | null,
  viewerCount: number | null,
): string {
  const ratio = calculateViewersPerThousandUsd(usdAmount, viewerCount);
  if (ratio === null) return '—';
  if (ratio >= 100) return ratio.toFixed(0);
  if (ratio >= 10) return ratio.toFixed(1);
  return ratio.toFixed(2);
}
