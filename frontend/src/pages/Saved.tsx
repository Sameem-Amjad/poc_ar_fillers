import { useEffect, useState } from 'react';
import { ArrowLeft, Database } from 'lucide-react';
import { getSessions } from '../lib/api';
import { LIP_STYLES } from '../engine/lips/pipeline';

interface Session {
  id: string;
  treatment_id: string;
  dose: string;
  intensity: number;
  before_image_url: string;
  after_image_url: string;
  created_at: string;
}

interface Props {
  onBack: () => void;
}

// Resolve style names for both new ids ('russian') and legacy ids ('russian_lips').
function styleName(id: string): string {
  const s = LIP_STYLES.find(s => s.id === id || `${s.id}_lips` === id);
  return s ? `${s.name} lips` : id;
}

export function SavedPage({ onBack }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions()
      .then(data => setSessions(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="relative w-full h-full bg-base flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 bg-base border-b border-line">
        <button
          onClick={onBack}
          aria-label="Back to camera"
          className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-ink-secondary hover:bg-subtle active:scale-95 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-ink text-[17px] font-semibold leading-6">Sessions</h1>
          <p className="text-ink-secondary text-[13px] leading-[18px] tabular">
            {sessions.length} labelled {sessions.length === 1 ? 'pair' : 'pairs'} in the training dataset
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-accent-tint text-accent flex items-center justify-center">
          <Database size={18} />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-line border-t-accent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3 px-8 text-center">
            <div className="w-14 h-14 rounded-full bg-subtle text-ink-disabled flex items-center justify-center">
              <Database size={22} />
            </div>
            <p className="text-ink-body text-sm font-medium">No sessions yet</p>
            <p className="text-ink-secondary text-[13px] leading-[18px]">
              Save a visualization to start building the clinic's dataset.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-4 bg-elevated">
                {/* Split thumbnail */}
                <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-subtle">
                  {s.before_image_url && (
                    <img
                      src={s.before_image_url}
                      className="absolute inset-0 w-full h-full object-cover"
                      alt="Before"
                    />
                  )}
                  {s.after_image_url && (
                    <img
                      src={s.after_image_url}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ clipPath: 'inset(0 0 0 50%)' }}
                      alt="After"
                    />
                  )}
                  <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/70" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-ink text-sm font-semibold">{styleName(s.treatment_id)}</p>
                  <p className="text-ink-secondary text-[13px] mt-0.5 tabular">{s.dose.replace('ml', ' ml')}</p>
                  <p className="text-ink-disabled text-xs mt-0.5 tabular">
                    {new Date(s.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-1.5 bg-accent-tint rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-accent text-[11px] font-semibold">Queued</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
