import { useEffect, useState } from 'react';

interface Props {
  onStart: () => void;
}

export function Splash({ onStart }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between bg-black overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950 to-black" />
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)' }}
      />

      {/* Content */}
      <div
        className="relative flex flex-col items-center justify-center flex-1 gap-6 px-8 text-center transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)' }}
      >
        {/* Logo mark */}
        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-4xl shadow-2xl">
          ✨
        </div>

        <div>
          <h1 className="text-white text-4xl font-bold tracking-tight mb-2">
            Aesthetic AI
          </h1>
          <p className="text-white/50 text-base leading-relaxed">
            Visualise your treatment<br />before it happens
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          {['Real-time AR', 'Lip Filler', 'Cheeks', 'Chin', 'Jawline'].map(f => (
            <span key={f} className="text-xs text-white/40 border border-white/10 rounded-full px-3 py-1">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div
        className="relative w-full px-6 pb-12 flex flex-col gap-3 transition-all duration-700 delay-300"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)' }}
      >
        <button
          onClick={onStart}
          className="w-full py-4 rounded-2xl bg-white text-black text-base font-semibold tracking-tight hover:bg-white/90 active:scale-95 transition-all"
        >
          Start Experience
        </button>
        <p className="text-white/20 text-xs text-center">
          Camera access required · Works in any browser
        </p>
      </div>
    </div>
  );
}
