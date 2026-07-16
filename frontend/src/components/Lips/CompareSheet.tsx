import { useState, useRef, useCallback } from 'react';
import { ArrowLeft, Download, LayoutGrid } from 'lucide-react';
import type { LipStyle } from '../../engine/lips/pipeline';
import type { StyleRender } from './LipStage';

interface Props {
  beforeSrc: string;
  afterSrc: string;
  styles: StyleRender[];
  style: LipStyle | null;
  doseMl: number;
  onClose: () => void;
  onSave: () => void;
}

type View = 'result' | 'styles';

// Compose the consultation grid (before + every style) into one image.
async function composeGrid(beforeSrc: string, styles: StyleRender[]): Promise<string> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  const cells = [
    { label: 'Before', img: await load(beforeSrc) },
    ...(await Promise.all(styles.map(async s => ({
      label: `${s.name} · ${s.doseMl.toFixed(2).replace(/0$/, '')} ml`,
      img: await load(s.dataURL),
    })))),
  ];

  const COLS = 2;
  const CELL_W = 640;
  const aspect = cells[0].img.naturalHeight / cells[0].img.naturalWidth;
  const CELL_H = Math.round(CELL_W * aspect);
  const GAP = 10;
  const LABEL_H = 54;
  const FOOTER = 64;
  const rows = Math.ceil(cells.length / COLS);

  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL_W + (COLS + 1) * GAP;
  canvas.height = rows * (CELL_H + LABEL_H) + (rows + 1) * GAP + FOOTER;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  cells.forEach((cell, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = GAP + col * (CELL_W + GAP);
    const y = GAP + row * (CELL_H + LABEL_H + GAP);
    ctx.drawImage(cell.img, x, y, CELL_W, CELL_H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y + CELL_H, CELL_W, LABEL_H);
    ctx.fillStyle = i === 0 ? '#3a434f' : '#1f6f6b';
    ctx.font = '600 24px -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(cell.label, x + 18, y + CELL_H + 35);
  });

  ctx.fillStyle = '#6b7480';
  ctx.font = '400 18px -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(
    `Aesthetic AI · lip filler visualization · ${new Date().toLocaleDateString()} — simulation, not a guarantee of clinical results`,
    GAP + 8, canvas.height - 26
  );
  return canvas.toDataURL('image/jpeg', 0.92);
}

// Interactive before/after review — clinical presentation of the capture.
export function CompareSheet({ beforeSrc, afterSrc, styles, style, doseMl, onClose, onSave }: Props) {
  const [split, setSplit] = useState(50);
  const [view, setView] = useState<View>('result');
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  const downloadGrid = useCallback(async () => {
    const url = await composeGrid(beforeSrc, styles);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'style-comparison.jpg';
    a.click();
  }, [beforeSrc, styles]);

  return (
    <div className="absolute inset-0 z-30 bg-base flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <button
          onClick={onClose}
          aria-label="Back to camera"
          className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-ink-secondary hover:bg-subtle active:scale-95 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-ink text-[17px] font-semibold leading-6">Review result</h1>
          <p className="text-ink-secondary text-[13px] leading-[18px] tabular">
            {style ? `${style.name} · ${doseMl.toFixed(2).replace(/0$/, '')} ml` : 'Untreated capture'}
          </p>
        </div>
        {styles.length > 0 && (
          <div className="flex rounded-full bg-subtle p-1">
            <button
              onClick={() => setView('result')}
              className={`px-3.5 h-9 rounded-full text-[13px] font-medium transition-all ${
                view === 'result' ? 'bg-elevated text-ink shadow-sm' : 'text-ink-secondary'
              }`}
            >
              Result
            </button>
            <button
              onClick={() => setView('styles')}
              className={`px-3.5 h-9 rounded-full text-[13px] font-medium transition-all flex items-center gap-1.5 ${
                view === 'styles' ? 'bg-elevated text-ink shadow-sm' : 'text-ink-secondary'
              }`}
            >
              <LayoutGrid size={14} /> All styles
            </button>
          </div>
        )}
      </div>

      {view === 'result' ? (
        /* Comparison slider card */
        <div className="flex-1 px-5 pb-2 min-h-0">
          <div
            ref={containerRef}
            className="relative w-full h-full rounded-2xl overflow-hidden bg-[#0f1116] select-none shadow-[0_2px_8px_rgba(16,21,28,0.06)]"
            onMouseMove={e => { if (dragging.current) handleMove(e.clientX); }}
            onMouseUp={() => { dragging.current = false; }}
            onMouseLeave={() => { dragging.current = false; }}
            onTouchMove={e => handleMove(e.touches[0].clientX)}
            onTouchEnd={() => { dragging.current = false; }}
          >
            <img src={afterSrc} alt="After" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${split}%` }}>
              <img
                src={beforeSrc}
                alt="Before"
                className="absolute inset-0 h-full object-contain"
                style={{ width: `${split > 0 ? (100 / split) * 100 : 100}%`, maxWidth: 'none' }}
                draggable={false}
              />
            </div>

            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full ar-surface text-white text-[11px] font-semibold uppercase tracking-[0.1em]">
              Before
            </span>
            <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-accent text-white text-[11px] font-semibold uppercase tracking-[0.1em]">
              After
            </span>

            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white cursor-ew-resize touch-none"
              style={{ left: `${split}%`, transform: 'translateX(-50%)' }}
              onMouseDown={() => { dragging.current = true; }}
              onTouchStart={() => { dragging.current = true; }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg ring-2 ring-accent flex items-center justify-center">
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden>
                  <path d="M4 1 1 5l3 4M10 1l3 4-3 4" stroke="#2a8c86" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* All-styles consultation grid */
        <div className="flex-1 px-5 pb-2 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <figure className="m-0">
              <img src={beforeSrc} alt="Before" className="w-full rounded-xl bg-[#0f1116]" />
              <figcaption className="text-ink-secondary text-[13px] font-semibold mt-1.5">Before</figcaption>
            </figure>
            {styles.map(s => (
              <figure key={s.id} className="m-0">
                <img src={s.dataURL} alt={s.name} className="w-full rounded-xl bg-[#0f1116]" />
                <figcaption className="text-accent text-[13px] font-semibold mt-1.5 tabular">
                  {s.name} · {s.doseMl.toFixed(2).replace(/0$/, '')} ml
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer + actions */}
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 flex flex-col gap-3">
        <p className="text-ink-secondary text-[12px] leading-[17px] text-center px-4">
          This visualization is a simulation and an estimate — not a guarantee of clinical results.
        </p>
        <div className="flex gap-3">
          {view === 'styles' ? (
            <button
              onClick={downloadGrid}
              className="w-[52px] h-[52px] rounded-xl border border-line bg-elevated flex items-center justify-center text-ink-secondary hover:bg-subtle active:scale-95 transition-all"
              aria-label="Download style comparison"
            >
              <Download size={20} />
            </button>
          ) : (
            <a
              href={afterSrc}
              download="lip-visualization.jpg"
              className="w-[52px] h-[52px] rounded-xl border border-line bg-elevated flex items-center justify-center text-ink-secondary hover:bg-subtle active:scale-95 transition-all"
              aria-label="Download after image"
            >
              <Download size={20} />
            </a>
          )}
          <button
            onClick={onSave}
            className="flex-1 h-[52px] rounded-xl bg-accent text-white text-base font-semibold hover:bg-accent-press active:scale-[0.98] transition-all"
          >
            Save session
          </button>
        </div>
      </div>
    </div>
  );
}
