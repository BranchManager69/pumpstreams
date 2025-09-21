'use client';

import { calculateViewersPerThousandUsd, formatViewersPerThousandUsd } from './metric-formatters';

type ViewersPerKProps = {
  usdAmount: number | null;
  viewerCount: number | null;
  layout?: 'table' | 'card';
  maxIcons?: number;
};

const MAX_ICONS_DEFAULT = 30;
function buildIconArray(value: number, maxIcons: number) {
  const clamped = Math.min(value, maxIcons);
  const fullIcons = Math.floor(clamped);
  const fractional = clamped - fullIcons;
  const icons: number[] = [];

  for (let i = 0; i < fullIcons; i += 1) {
    icons.push(1);
  }

  if (fractional > 0 && icons.length < maxIcons) {
    icons.push(fractional);
  }

  return {
    icons,
    overflow: value > maxIcons,
  };
}

export function ViewersPerKVisual({
  usdAmount,
  viewerCount,
  layout = 'table',
  maxIcons = MAX_ICONS_DEFAULT,
}: ViewersPerKProps) {
  const ratio = calculateViewersPerThousandUsd(usdAmount, viewerCount);
  if (ratio === null) {
    return (
      <span className={`viewers-k viewers-k--${layout} viewers-k--empty`} aria-label="Viewers per $1K unavailable">
        —
      </span>
    );
  }

  const { icons, overflow } = buildIconArray(ratio, maxIcons);
  const ratioLabel = formatViewersPerThousandUsd(usdAmount, viewerCount);

  return (
    <div
      className={`viewers-k viewers-k--${layout}${overflow ? ' viewers-k--overflow' : ''}`}
      title={`${ratioLabel} viewers per $1K`}
      aria-label={`${ratioLabel} viewers per $1K market cap`}
      role="img"
    >
      {icons.map((fraction, index) => (
        <StickFigureIcon key={index} fraction={fraction} />
      ))}
      {overflow ? <StickFigureOverflow /> : null}
    </div>
  );
}

type StickFigureIconProps = {
  fraction: number;
};

function StickFigureIcon({ fraction }: StickFigureIconProps) {
  const clip = fraction >= 0.999 ? undefined : `inset(0 ${Math.max(0, 100 - fraction * 100)}% 0 0)`;

  return (
    <span className="viewers-k__figure" aria-hidden="true">
      <svg className="viewers-k__figure-base" viewBox="0 0 24 24">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
      <svg className="viewers-k__figure-fill" viewBox="0 0 24 24" style={clip ? { clipPath: clip } : undefined}>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </span>
  );
}

function StickFigureOverflow() {
  return (
    <span className="viewers-k__figure viewers-k__figure--overflow" aria-hidden="true">
      <span className="viewers-k__overflow-symbol">+</span>
    </span>
  );
}
