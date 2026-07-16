import { useRef, useCallback } from 'react';

interface Props {
  valueMl: number;
  minMl: number;
  maxMl: number;
  onChange: (ml: number) => void;
}

// Dosage slider — 4pt track, teal fill, white thumb with accent ring,
// live tabular value pill riding above the thumb (Stitch spec, screen 29).
export function DoseSlider({ valueMl, minMl, maxMl, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = ((valueMl - minMl) / (maxMl - minMl)) * 100;

  const setFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = minMl + t * (maxMl - minMl);
    onChange(Math.round(raw * 20) / 20); // 0.05 ml steps
  }, [minMl, maxMl, onChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons > 0) setFromClientX(e.clientX);
  };

  return (
    <div className="flex items-center gap-3 select-none">
      <span className="text-white/70 text-[11px] font-semibold uppercase tracking-[0.12em] w-14">
        Dosage
      </span>
      <div
        ref={trackRef}
        className="relative flex-1 h-11 flex items-center cursor-pointer touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        role="slider"
        aria-valuemin={minMl}
        aria-valuemax={maxMl}
        aria-valuenow={valueMl}
        aria-label="Filler dosage in millilitres"
      >
        <div className="absolute left-0 right-0 h-1 rounded-full bg-white/25" />
        <div
          className="absolute left-0 h-1 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute -translate-x-1/2 w-7 h-7 rounded-full bg-white shadow-md ring-2 ring-accent"
          style={{ left: `${pct}%` }}
        >
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-white text-ink text-xs font-semibold tabular whitespace-nowrap shadow-sm">
            {valueMl.toFixed(2).replace(/0$/, '')} ml
          </span>
        </div>
      </div>
    </div>
  );
}
