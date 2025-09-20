'use client';

import { useState } from 'react';

type ClipDownloadButtonProps = {
  clipId: string;
  track: 'audio' | 'video';
  disabled?: boolean;
};

export function ClipDownloadButton({ clipId, track, disabled }: ClipDownloadButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    if (disabled || status === 'loading') return;
    setStatus('loading');
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/clips/${clipId}/presign?track=${track}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `Unable to fetch ${track} clip`);
      }
      const payload = (await res.json()) as { url?: string };
      if (!payload.url) {
        throw new Error('Download URL missing');
      }
      window.open(payload.url, '_blank', 'noopener');
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open clip');
      setTimeout(() => {
        setStatus('idle');
        setErrorMessage(null);
      }, 4000);
    }
  }

  const label = track === 'audio' ? 'Audio' : 'Video';

  return (
    <button
      type="button"
      className={`clip-action-btn clip-action-btn--${track}`}
      onClick={handleClick}
      disabled={disabled || status === 'loading'}
      title={disabled ? `No ${label.toLowerCase()} track` : `Open ${label.toLowerCase()} clip`}
    >
      {status === 'loading' ? '…' : label}
      {status === 'error' && errorMessage ? <span className="clip-error">{errorMessage}</span> : null}
    </button>
  );
}
