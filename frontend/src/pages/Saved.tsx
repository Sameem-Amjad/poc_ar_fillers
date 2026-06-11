import { useEffect, useState } from 'react';
import { getSessions } from '../lib/api';
import { PRESETS } from '../engine/presets';

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

export function SavedPage({ onBack }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions()
      .then(data => setSessions(data))
      .finally(() => setLoading(false));
  }, []);

  const getPreset = (id: string) => PRESETS.find(p => p.id === id);

  return (
    <div className="relative w-full h-full bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-12 pb-4 bg-black/80 border-b border-white/10">
        <button onClick={onBack} className="text-white/60 text-lg">←</button>
        <div>
          <h1 className="text-white text-lg font-semibold">Session Archive</h1>
          <p className="text-white/40 text-xs">{sessions.length} cases in AI dataset</p>
        </div>
      </div>

      {/* Stats bar */}
      {sessions.length > 0 && (
        <div className="flex border-b border-white/10">
          {['Lips', 'Cheeks', 'Chin/Jaw'].map(cat => {
            const cats = cat === 'Lips' ? ['lips'] : cat === 'Cheeks' ? ['cheeks', 'nasolabial'] : ['chin', 'jaw'];
            const count = sessions.filter(s => {
              const p = getPreset(s.treatment_id);
              return p && cats.includes(p.category);
            }).length;
            return (
              <div key={cat} className="flex-1 flex flex-col items-center py-3 gap-0.5">
                <span className="text-white font-bold text-lg">{count}</span>
                <span className="text-white/30 text-xs">{cat}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3">
            <span className="text-4xl">🧠</span>
            <p className="text-white/30 text-sm">No sessions yet</p>
            <p className="text-white/20 text-xs">Save a session to add to the dataset</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-white/5">
            {sessions.map(s => {
              const p = getPreset(s.treatment_id);
              return (
                <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Before/after thumbnails */}
                  <div className="relative w-16 h-16 flex-shrink-0">
                    {s.before_image_url && (
                      <img
                        src={s.before_image_url}
                        className="absolute inset-0 w-full h-full object-cover rounded-xl opacity-60"
                        alt="before"
                      />
                    )}
                    {s.after_image_url && (
                      <img
                        src={s.after_image_url}
                        className="absolute inset-0 w-full h-full object-cover rounded-xl"
                        style={{ clipPath: 'inset(0 0 0 50%)' }}
                        alt="after"
                      />
                    )}
                    {!s.before_image_url && (
                      <div className="w-full h-full rounded-xl bg-white/5 flex items-center justify-center text-2xl">
                        {p?.icon ?? '💉'}
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">
                      {p?.name ?? s.treatment_id}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {s.dose} · {Math.round(s.intensity * 100)}% intensity
                    </p>
                    <p className="text-white/20 text-xs mt-1">
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Queued badge */}
                  <div className="flex-shrink-0 flex items-center gap-1 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-green-400 text-[10px]">Training</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
