import { useEffect, type RefObject } from 'react';

export function useCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  facingMode: 'user' | 'environment' = 'user'
) {
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error('Camera access denied:', err);
      }
    }

    startCamera();

    return () => {
      stream?.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [facingMode]);
}
