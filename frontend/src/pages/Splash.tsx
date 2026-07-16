import { useEffect, useState } from 'react';
import { ScanFace, Droplets, GalleryVerticalEnd } from 'lucide-react';

interface Props {
  onStart: () => void;
}

const FEATURES = [
  { icon: ScanFace, title: 'Real-time visualization', body: 'Live 478-point face tracking maps every contour of the lips.' },
  { icon: Droplets, title: 'Dose-accurate simulation', body: 'Natural, Russian and French techniques from 0.3 to 1.5 ml.' },
  { icon: GalleryVerticalEnd, title: 'Session records', body: 'Every consultation captured as a labelled before/after pair.' },
];

export function Splash({ onStart }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col bg-base overflow-hidden">
      <div
        className="flex flex-col flex-1 justify-center px-6 max-w-md w-full mx-auto transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)' }}
      >
        {/* Wordmark */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center">
            <ScanFace size={24} className="text-white" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-ink text-[17px] font-semibold leading-tight">Aesthetic AI</p>
            <p className="text-ink-secondary text-[13px] leading-tight">Clinical visualization</p>
          </div>
        </div>

        <h1 className="text-ink text-[32px] leading-[38px] font-semibold tracking-[-0.02em] mb-3">
          See the result<br />before the treatment
        </h1>
        <p className="text-ink-body text-base leading-6 mb-9">
          Realistic lip filler visualization for clinics. Show patients their expected
          outcome — live, on their own face, at the exact dose you plan to use.
        </p>

        {/* Feature list */}
        <div className="flex flex-col gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-accent-tint text-accent flex items-center justify-center shrink-0">
                <f.icon size={19} strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-ink text-[15px] font-semibold leading-5 mb-0.5">{f.title}</p>
                <p className="text-ink-secondary text-[13px] leading-[18px]">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div
        className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))] max-w-md w-full mx-auto flex flex-col gap-3 transition-all duration-700 delay-200"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)' }}
      >
        <button
          onClick={onStart}
          className="w-full h-[52px] rounded-xl bg-accent text-white text-base font-semibold
            hover:bg-accent-press active:scale-[0.98] transition-all"
        >
          Begin visualization
        </button>
        <p className="text-ink-disabled text-xs text-center leading-[17px]">
          All processing happens on this device. Camera frames never leave it.
        </p>
      </div>
    </div>
  );
}
