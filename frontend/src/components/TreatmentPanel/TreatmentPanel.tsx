import { PRESETS, type TreatmentPreset } from '../../engine/presets';
import { TreatmentCard } from './TreatmentCard';

interface Props {
  active: TreatmentPreset | null;
  onSelect: (preset: TreatmentPreset) => void;
}

const CATEGORIES = [
  { key: 'lips', label: 'Lips' },
  { key: 'cheeks', label: 'Cheeks' },
  { key: 'chin', label: 'Chin' },
  { key: 'jaw', label: 'Jaw' },
  { key: 'nasolabial', label: 'Folds' },
] as const;

export function TreatmentPanel({ active, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-black/60 backdrop-blur-md rounded-2xl border border-white/10">
      <p className="text-white/40 text-[9px] uppercase tracking-widest font-semibold text-center">
        Treatment
      </p>
      {CATEGORIES.map(cat => {
        const presets = PRESETS.filter(p => p.category === cat.key);
        if (presets.length === 0) return null;
        return (
          <div key={cat.key} className="flex flex-col gap-1">
            <p className="text-white/30 text-[8px] uppercase tracking-wider pl-1">{cat.label}</p>
            <div className="flex flex-col gap-1">
              {presets.map(p => (
                <TreatmentCard
                  key={p.id}
                  treatment={p}
                  isActive={active?.id === p.id}
                  onSelect={() => onSelect(p)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
