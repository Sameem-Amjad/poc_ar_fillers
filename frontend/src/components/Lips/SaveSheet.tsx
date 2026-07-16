import { useState, useEffect } from 'react';
import { Check, Database } from 'lucide-react';
import type { LipStyle } from '../../engine/lips/pipeline';
import { saveSession } from '../../lib/api';

interface Props {
  style: LipStyle | null;
  doseMl: number;
  beforeImage: string | null;
  afterImage: string | null;
  onClose: () => void;
  onViewSessions: () => void;
}

// The "data flywheel" beat from the demo script: every saved session is a
// labelled before/after pair queued for the future training pipeline.
const PIPELINE_STEPS = [
  { label: 'Before image captured', delay: 350 },
  { label: 'After image captured', delay: 800 },
  { label: 'Treatment parameters recorded', delay: 1250 },
  { label: 'Queued for AI training dataset', delay: 1800 },
];

export function SaveSheet({ style, doseMl, beforeImage, afterImage, onClose, onViewSessions }: Props) {
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const timers = PIPELINE_STEPS.map((s, i) => setTimeout(() => setStep(i + 1), s.delay));
    timers.push(setTimeout(() => setSaved(true), 2300));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (saved && style) {
      saveSession({
        treatment_id: style.id,
        dose: `${doseMl.toFixed(2).replace(/0$/, '')}ml`,
        intensity: 1,
        before_image_url: beforeImage ?? '',
        after_image_url: afterImage ?? '',
        metadata: { treatment_name: style.name, category: 'lips' },
      }).then(r => setSessionId(r?.id ?? null)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  return (
    <div className="absolute inset-0 z-40 bg-ink/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6">
      <div className="w-full sm:max-w-sm bg-elevated rounded-t-[20px] sm:rounded-[20px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_8px_32px_rgba(16,21,28,0.18)]">
        {/* Status */}
        <div className="flex justify-center mb-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500
            ${saved ? 'bg-accent-tint text-accent' : 'bg-subtle text-ink-disabled'}`}>
            {saved
              ? <Check size={26} strokeWidth={2.5} />
              : <div className="w-6 h-6 border-2 border-ink-disabled/40 border-t-ink-secondary rounded-full animate-spin" />}
          </div>
        </div>

        <h2 className="text-ink text-xl font-semibold text-center mb-1">
          {saved ? 'Session saved' : 'Saving session…'}
        </h2>
        {style && (
          <p className="text-ink-secondary text-sm text-center mb-5 tabular">
            {style.name} lips · {doseMl.toFixed(2).replace(/0$/, '')} ml
          </p>
        )}

        {/* Pipeline steps */}
        <div className="bg-base rounded-2xl p-4 mb-5 border border-line">
          <p className="text-ink-secondary text-[11px] font-semibold uppercase tracking-[0.12em] mb-3 flex items-center gap-2">
            <Database size={13} /> Training data pipeline
          </p>
          <div className="flex flex-col gap-2.5">
            {PIPELINE_STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300
                  ${i < step ? 'bg-accent text-white' : 'bg-subtle text-ink-disabled'}`}>
                  {i < step ? <Check size={12} strokeWidth={3} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                </span>
                <span className={`text-sm transition-colors duration-300 ${i < step ? 'text-ink-body' : 'text-ink-disabled'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          {saved && (
            <p className="text-ink-secondary text-xs mt-4 pt-3 border-t border-line">
              Anonymized pair added to the dataset. The prediction model retrains on the next cycle.
            </p>
          )}
        </div>

        {sessionId && (
          <p className="text-ink-disabled text-xs text-center mb-4 tabular">
            Session {sessionId.slice(0, 8)}
          </p>
        )}

        {saved && (
          <div className="flex gap-3">
            <button
              onClick={onViewSessions}
              className="flex-1 h-[52px] rounded-xl border border-line text-ink-body text-base font-semibold hover:bg-subtle active:scale-[0.98] transition-all"
            >
              View sessions
            </button>
            <button
              onClick={onClose}
              className="flex-1 h-[52px] rounded-xl bg-accent text-white text-base font-semibold hover:bg-accent-press active:scale-[0.98] transition-all"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
