import { Check } from 'lucide-react';
import { LIP_STYLES, type LipStyle } from '../../engine/lips/pipeline';

interface Props {
  active: LipStyle | null;
  onSelect: (style: LipStyle | null) => void;
}

export function StyleChips({ active, onSelect }: Props) {
  return (
    <div className="flex justify-center gap-2">
      {LIP_STYLES.map(s => {
        const selected = active?.id === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(selected ? null : s)}
            aria-pressed={selected}
            className={`flex items-center gap-1.5 h-11 px-4 rounded-full text-sm font-medium transition-all
              ${selected
                ? 'bg-accent text-white shadow-lg shadow-accent/25'
                : 'ar-surface text-white/85 hover:text-white active:scale-95'}`}
          >
            {selected && <Check size={15} strokeWidth={2.5} />}
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
