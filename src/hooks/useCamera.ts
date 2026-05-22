import { useEffect, useRef, useState } from "react";

export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API not available");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Camera unavailable";
        setError(msg);
      }
    };
    start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setReady(false);
    };
  }, [enabled]);

  return { videoRef, error, ready };
}
