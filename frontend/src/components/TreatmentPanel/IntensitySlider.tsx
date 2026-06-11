interface Props {
  value: number;
  onChange: (v: number) => void;
}

export function IntensitySlider({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-white/50 text-xs w-16">Intensity</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-white h-1 cursor-pointer"
      />
      <span className="text-white text-xs w-10 text-right font-mono">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}
