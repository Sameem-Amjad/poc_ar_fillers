import { clsx } from 'clsx';
import type { TreatmentPreset } from '../../engine/presets';

interface Props {
  treatment: TreatmentPreset;
  isActive: boolean;
  onSelect: () => void;
}

export function TreatmentCard({ treatment, isActive, onSelect }: Props) {
  return (
    <button
      onClick={onSelect}
      className={clsx(
        'flex flex-col items-center gap-1 p-2 rounded-xl border transition-all w-14',
        isActive
          ? 'bg-white/20 border-white/60 scale-105'
          : 'bg-black/30 border-white/10 hover:bg-white/10 hover:border-white/30'
      )}
    >
      <span className="text-lg leading-none">{treatment.icon}</span>
      <span className="text-white text-[10px] leading-tight text-center font-medium">
        {treatment.name}
      </span>
    </button>
  );
}
