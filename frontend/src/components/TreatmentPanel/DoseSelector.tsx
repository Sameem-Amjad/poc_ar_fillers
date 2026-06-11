import { clsx } from 'clsx';

interface Props {
  doses: string[];
  active: string;
  onChange: (dose: string) => void;
}

export function DoseSelector({ doses, active, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/50 text-xs w-16">Dose</span>
      <div className="flex gap-2">
        {doses.map(dose => (
          <button
            key={dose}
            onClick={() => onChange(dose)}
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-medium border transition-all',
              active === dose
                ? 'bg-white text-black border-white'
                : 'bg-transparent text-white/60 border-white/20 hover:border-white/50'
            )}
          >
            {dose}
          </button>
        ))}
      </div>
    </div>
  );
}
