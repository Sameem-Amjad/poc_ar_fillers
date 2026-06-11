import { useState, useRef, useCallback } from 'react';
import { ARCamera } from '../components/ARCamera/ARCamera';
import { ARImageProcessor } from '../components/ARImage/ARImageProcessor';
import { TreatmentPanel } from '../components/TreatmentPanel/TreatmentPanel';
import { IntensitySlider } from '../components/TreatmentPanel/IntensitySlider';
import { DoseSelector } from '../components/TreatmentPanel/DoseSelector';
import { BeforeAfterSlider } from '../components/BeforeAfter/BeforeAfterSlider';
import { SaveModal } from '../components/SaveSession/SaveModal';
import type { TreatmentPreset } from '../engine/presets';

type Mode = 'live' | 'compare' | 'save';

interface Props {
  onViewSessions: () => void;
}

export function CameraPage({ onViewSessions }: Props) {
  const [preset, setPreset] = useState<TreatmentPreset | null>(null);
  const [dose, setDose] = useState('1.0ml');
  const [intensity, setIntensity] = useState(0.8);
  const [mode, setMode] = useState<Mode>('live');
  const [inputMode, setInputMode] = useState<'camera' | 'image'>('camera');
  const [showMesh, setShowMesh] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [captures, setCaptures] = useState<{ before: string; after: string } | null>(null);
  const captureRef = useRef<(() => void) | null>(null);

  const handlePresetSelect = useCallback((p: TreatmentPreset) => {
    setPreset(prev => prev?.id === p.id ? null : p);
    // Auto-select first dose
    const firstDose = Object.keys(p.doses)[0];
    if (firstDose) setDose(firstDose);
  }, []);

  const handleCapture = useCallback(() => {
    captureRef.current?.();
  }, []);

  const handleCaptured = useCallback((before: string, after: string) => {
    setCaptures({ before, after });
    setMode('compare');
  }, []);

  const doses = preset ? Object.keys(preset.doses) : [];

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Camera / Image toggle — top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex rounded-full bg-black/60 backdrop-blur-sm border border-white/10 p-1">
        <button
          onClick={() => setInputMode('camera')}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
            inputMode === 'camera' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
          }`}
        >
          Live Camera
        </button>
        <button
          onClick={() => setInputMode('image')}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
            inputMode === 'image' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
          }`}
        >
          Upload Photo
        </button>
      </div>

      {/* AR input — fills screen */}
      {inputMode === 'camera' ? (
        <ARCamera
          preset={preset}
          dose={dose}
          intensity={intensity}
          showMesh={showMesh}
          facingMode={facingMode}
          onCapture={handleCaptured}
          captureRef={captureRef}
        />
      ) : (
        <ARImageProcessor
          preset={preset}
          dose={dose}
          intensity={intensity}
          showMesh={showMesh}
          onCapture={handleCaptured}
          captureRef={captureRef}
        />
      )}

      {/* Treatment panel — right side */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
        <TreatmentPanel active={preset} onSelect={handlePresetSelect} />
      </div>

      {/* Top controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        {inputMode === 'camera' && (
          <button
            onClick={() => setFacingMode(m => m === 'user' ? 'environment' : 'user')}
            className="w-10 h-10 rounded-full bg-black/50 border border-white/20 text-white flex items-center justify-center text-lg"
            title="Flip camera"
          >
            🔄
          </button>
        )}
        <button
          onClick={() => setShowMesh(m => !m)}
          className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-bold
            ${showMesh ? 'bg-white/20 border-white/60 text-white' : 'bg-black/50 border-white/20 text-white/50'}`}
          title="Toggle mesh"
        >
          ⊹
        </button>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pb-8 px-4">
        {/* Semi-transparent control area */}
        <div className="bg-black/60 backdrop-blur-sm rounded-3xl p-4 flex flex-col gap-3 border border-white/10">

          {/* Preset-specific controls */}
          {preset && (
            <>
              {doses.length > 1 && (
                <DoseSelector doses={doses} active={dose} onChange={setDose} />
              )}
              <IntensitySlider value={intensity} onChange={setIntensity} />
              <div className="h-px bg-white/10" />
            </>
          )}

          {/* Main action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleCapture}
              disabled={!preset}
              className="flex-1 py-3 rounded-2xl border border-white/20 text-white/80 text-sm font-medium
                disabled:opacity-30 disabled:cursor-not-allowed
                hover:bg-white/10 active:scale-95 transition-all"
            >
              Compare
            </button>
            <button
              onClick={() => {
                handleCapture();
                setTimeout(() => setMode('save'), 100);
              }}
              className="flex-1 py-3 rounded-2xl bg-white text-black text-sm font-semibold
                hover:bg-white/90 active:scale-95 transition-all"
            >
              Save Session
            </button>
          </div>
        </div>
      </div>

      {/* Before/After overlay */}
      {mode === 'compare' && captures && (
        <BeforeAfterSlider
          beforeSrc={captures.before}
          afterSrc={captures.after}
          onClose={() => setMode('live')}
          onSave={() => setMode('save')}
        />
      )}

      {/* Save modal */}
      {mode === 'save' && (
        <SaveModal
          preset={preset}
          dose={dose}
          intensity={intensity}
          beforeImage={captures?.before ?? null}
          afterImage={captures?.after ?? null}
          onClose={() => setMode('live')}
          onViewSessions={onViewSessions}
        />
      )}
    </div>
  );
}
