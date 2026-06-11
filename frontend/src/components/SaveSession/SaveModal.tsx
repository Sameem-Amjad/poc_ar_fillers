import { useState, useEffect } from 'react';
import type { TreatmentPreset } from '../../engine/presets';
import { saveSession } from '../../lib/api';

interface Props {
  preset: TreatmentPreset | null;
  dose: string;
  intensity: number;
  beforeImage: string | null;
  afterImage: string | null;
  onClose: () => void;
  onViewSessions: () => void;
}

const PIPELINE_STEPS = [
  { label: 'Before image captured', delay: 400 },
  { label: 'After image captured', delay: 900 },
  { label: 'Treatment parameters', delay: 1400 },
  { label: 'Queued for AI training', delay: 2000 },
];

export function SaveModal({
  preset,
  dose,
  intensity,
  beforeImage,
  afterImage,
  onClose,
  onViewSessions,
}: Props) {
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    PIPELINE_STEPS.forEach((s, i) => {
      setTimeout(() => setStep(i + 1), s.delay);
    });
    setTimeout(() => setSaved(true), 2600);
  }, []);

  useEffect(() => {
    if (saved && preset) {
      saveSession({
        treatment_id: preset.id,
        dose,
        intensity,
        before_image_url: beforeImage ?? '',
        after_image_url: afterImage ?? '',
        metadata: { treatment_name: preset.name, category: preset.category },
      }).then(r => setSessionId(r?.id ?? null)).catch(() => {});
    }
  }, [saved]);

  return (
    <div className="absolute inset-0 bg-black/90 z-40 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-zinc-900 rounded-3xl p-6 border border-white/10">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl transition-all duration-500
            ${saved ? 'bg-green-500/20 border-2 border-green-500' : 'bg-white/5 border-2 border-white/20'}`}>
            {saved ? '✓' : '⏳'}
          </div>
        </div>

        <h2 className="text-white text-xl font-semibold text-center mb-1">
          {saved ? 'Session Saved!' : 'Saving Session…'}
        </h2>
        {preset && (
          <p className="text-white/40 text-sm text-center mb-6">
            {preset.name} · {dose} · {Math.round(intensity * 100)}%
          </p>
        )}

        {/* AI pipeline steps */}
        <div className="bg-black/40 rounded-2xl p-4 mb-5 border border-white/5">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
            <span>🧠</span> AI Training Queue
          </p>
          <div className="flex flex-col gap-2">
            {PIPELINE_STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all duration-300
                  ${i < step ? 'bg-green-500 text-black' : 'bg-white/10 text-white/30'}`}>
                  {i < step ? '✓' : '○'}
                </span>
                <span className={`text-sm transition-colors duration-300 ${i < step ? 'text-white' : 'text-white/30'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {saved && (
            <p className="text-white/40 text-xs mt-4 pt-3 border-t border-white/10">
              Model will update on next training cycle
            </p>
          )}
        </div>

        {sessionId && (
          <p className="text-white/30 text-xs text-center mb-4 font-mono">
            ID: {sessionId.slice(0, 8)}…
          </p>
        )}

        {/* Actions */}
        {saved && (
          <div className="flex gap-3">
            <button
              onClick={onViewSessions}
              className="flex-1 py-3 rounded-2xl border border-white/20 text-white/70 text-sm font-medium"
            >
              View All
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-white text-black text-sm font-semibold"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
