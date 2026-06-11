import { useState, useRef, useCallback } from 'react';

interface Props {
  beforeSrc: string;
  afterSrc: string;
  onClose: () => void;
  onSave: () => void;
}

export function BeforeAfterSlider({ beforeSrc, afterSrc, onClose, onSave }: Props) {
  const [split, setSplit] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setSplit(pct);
  }, []);

  const onMouseMove = (e: React.MouseEvent) => { if (dragging.current) handleMove(e.clientX); };
  const onTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);

  return (
    <div className="absolute inset-0 bg-black z-30 flex flex-col">
      {/* Image comparison area */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden select-none"
        onMouseMove={onMouseMove}
        onMouseUp={() => { dragging.current = false; }}
        onTouchMove={onTouchMove}
        onTouchEnd={() => { dragging.current = false; }}
      >
        {/* After (full width) */}
        <img
          src={afterSrc}
          alt="After"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />

        {/* Before (clipped to left) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${split}%` }}
        >
          <img
            src={beforeSrc}
            alt="Before"
            className="absolute inset-0 h-full object-cover"
            style={{ width: `${(100 / split) * 100}%`, maxWidth: 'none' }}
            draggable={false}
          />
        </div>

        {/* Labels */}
        <div className="absolute top-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
          BEFORE
        </div>
        <div className="absolute top-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
          AFTER
        </div>

        {/* Divider + handle */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/80 cursor-ew-resize touch-none"
          style={{ left: `${split}%`, transform: 'translateX(-50%)' }}
          onMouseDown={() => { dragging.current = true; }}
          onTouchStart={() => { dragging.current = true; }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 bg-white rounded-full shadow-xl flex items-center justify-center text-black text-sm font-bold select-none">
            ◁▷
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex gap-3 p-4 bg-black/80">
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-2xl border border-white/20 text-white/80 text-sm font-medium"
        >
          Back
        </button>
        <button
          onClick={onSave}
          className="flex-1 py-3 rounded-2xl bg-white text-black text-sm font-semibold"
        >
          Save Session
        </button>
      </div>
    </div>
  );
}
