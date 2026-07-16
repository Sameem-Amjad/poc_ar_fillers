import { useState, useRef, useCallback } from 'react';
import { X, SwitchCamera, ScanFace, Eye, ImagePlus, GalleryVerticalEnd } from 'lucide-react';
import { LipStage, type StageStatus, type CaptureResult } from '../components/Lips/LipStage';
import { StyleChips } from '../components/Lips/StyleChips';
import { DoseSlider } from '../components/Lips/DoseSlider';
import { CompareSheet } from '../components/Lips/CompareSheet';
import { SaveSheet } from '../components/Lips/SaveSheet';
import type { LipStyle } from '../engine/lips/pipeline';

type Sheet = 'none' | 'compare' | 'save';

interface Props {
  onExit: () => void;
  onViewSessions: () => void;
}

const MIN_DOSE = 0.3;

export function CameraPage({ onExit, onViewSessions }: Props) {
  const [inputMode, setInputMode] = useState<'camera' | 'photo'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [style, setStyle] = useState<LipStyle | null>(null);
  const [doseMl, setDoseMl] = useState(0.5);
  const [holdOriginal, setHoldOriginal] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [status, setStatus] = useState<StageStatus>('initializing');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [sheet, setSheet] = useState<Sheet>('none');
  const [captures, setCaptures] = useState<CaptureResult | null>(null);

  const captureRef = useRef<(() => CaptureResult | null) | null>(null);

  const handleStyleSelect = useCallback((s: LipStyle | null) => {
    setStyle(s);
    if (s) setDoseMl(d => Math.min(Math.max(d, MIN_DOSE), s.maxDoseMl));
  }, []);

  const handleCapture = useCallback(() => {
    const result = captureRef.current?.();
    if (result) {
      setCaptures(result);
      setSheet('compare');
    }
  }, []);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
    e.target.value = '';
  }, []);

  const trackable = status === 'tracking';
  const statusHint =
    status === 'initializing' ? 'Loading face engine…'
    : status === 'no-face' ? 'Position the face in view'
    : status === 'no-source' && inputMode === 'camera' ? 'Camera unavailable — check permissions'
    : trackable && !style ? 'Select a treatment style' : null;

  const iconBtn = 'w-11 h-11 rounded-full ar-surface text-white flex items-center justify-center active:scale-95 transition-all';

  return (
    <div className="relative w-full h-full bg-[#0f1116] overflow-hidden">
      <LipStage
        mode={inputMode}
        image={inputMode === 'photo' ? image : null}
        facingMode={facingMode}
        style={style}
        doseMl={doseMl}
        showOriginal={holdOriginal}
        showLandmarks={showLandmarks}
        onStatus={setStatus}
        captureRef={captureRef}
      />

      {/* Photo mode: upload prompt */}
      {inputMode === 'photo' && !image && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <label className="flex flex-col items-center gap-4 cursor-pointer select-none px-8">
            <div className="w-20 h-20 rounded-full ar-surface flex items-center justify-center text-white/80">
              <ImagePlus size={30} strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-white font-semibold mb-1">Upload a portrait</p>
              <p className="text-white/55 text-sm">Front-facing with even lighting works best</p>
            </div>
            <span className="h-[52px] px-8 rounded-xl bg-accent text-white text-base font-semibold flex items-center hover:bg-accent-press active:scale-95 transition-all">
              Choose photo
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onExit} aria-label="Exit session" className={iconBtn}>
          <X size={19} />
        </button>

        <div className="flex rounded-full ar-surface p-1">
          {(['camera', 'photo'] as const).map(m => (
            <button
              key={m}
              onClick={() => setInputMode(m)}
              className={`px-4 h-9 rounded-full text-[13px] font-medium transition-all ${
                inputMode === m ? 'bg-white text-ink' : 'text-white/70 hover:text-white'
              }`}
            >
              {m === 'camera' ? 'Live camera' : 'Photo'}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {inputMode === 'camera' ? (
            <button
              onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')}
              aria-label="Flip camera"
              className={iconBtn}
            >
              <SwitchCamera size={19} />
            </button>
          ) : image ? (
            <label aria-label="Change photo" className={`${iconBtn} cursor-pointer`}>
              <ImagePlus size={19} />
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </label>
          ) : <div className="w-11" />}
          <button
            onClick={() => setShowLandmarks(v => !v)}
            aria-label="Toggle tracking overlay"
            aria-pressed={showLandmarks}
            className={`${iconBtn} ${showLandmarks ? 'ring-2 ring-accent text-accent-tint' : ''}`}
          >
            <ScanFace size={19} />
          </button>
        </div>
      </div>

      {/* Bottom controls — hidden while the photo-upload prompt is showing */}
      {!(inputMode === 'photo' && !image) && (
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-3 max-w-xl mx-auto w-full">
        {statusHint && (
          <div className="flex justify-center">
            <span className="px-3.5 py-1.5 rounded-full ar-surface text-white/85 text-[13px]">
              {statusHint}
            </span>
          </div>
        )}

        <StyleChips active={style} onSelect={handleStyleSelect} />

        {style && (
          <div className="ar-surface rounded-2xl px-4 pt-8 pb-1">
            <DoseSlider
              valueMl={doseMl}
              minMl={MIN_DOSE}
              maxMl={style.maxDoseMl}
              onChange={setDoseMl}
            />
          </div>
        )}

        <div className="flex items-center justify-center gap-8 pt-1">
          <button
            aria-label="Hold to view original"
            disabled={!style}
            onPointerDown={() => setHoldOriginal(true)}
            onPointerUp={() => setHoldOriginal(false)}
            onPointerLeave={() => setHoldOriginal(false)}
            className={`${iconBtn} disabled:opacity-35 ${holdOriginal ? 'ring-2 ring-white/70' : ''}`}
          >
            <Eye size={19} />
          </button>

          {/* Capture — 72pt ring per spec */}
          <button
            onClick={handleCapture}
            disabled={!trackable}
            aria-label="Capture before and after"
            className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center
              disabled:opacity-35 active:scale-95 transition-all"
          >
            <span className="w-[54px] h-[54px] rounded-full bg-white" />
          </button>

          <button onClick={onViewSessions} aria-label="View saved sessions" className={iconBtn}>
            <GalleryVerticalEnd size={19} />
          </button>
        </div>
      </div>
      )}

      {sheet === 'compare' && captures && (
        <CompareSheet
          beforeSrc={captures.before}
          afterSrc={captures.after}
          styles={captures.styles}
          style={style}
          doseMl={doseMl}
          onClose={() => setSheet('none')}
          onSave={() => setSheet('save')}
        />
      )}

      {sheet === 'save' && (
        <SaveSheet
          style={style}
          doseMl={doseMl}
          beforeImage={captures?.before ?? null}
          afterImage={captures?.after ?? null}
          onClose={() => setSheet('none')}
          onViewSessions={onViewSessions}
        />
      )}
    </div>
  );
}
