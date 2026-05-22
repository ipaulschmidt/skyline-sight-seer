import { Camera, MapPin, Compass } from "lucide-react";

interface Props {
  onStart: () => void;
  cameraError?: string | null;
  geoError?: string | null;
}

export function PermissionGate({ onStart, cameraError, geoError }: Props) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="font-mono-hud text-[10px] uppercase tracking-[0.3em] text-[var(--hud-accent)]">
        SkylineAR / v0.1
      </div>
      <h1 className="mt-3 font-display text-5xl font-bold uppercase tracking-wide text-white">
        See the city.<br />Labeled.
      </h1>
      <p className="mt-4 max-w-sm text-sm text-white/60">
        Point your phone at the skyline. SkylineAR overlays building names,
        heights, and Wikipedia info on your live camera feed.
      </p>

      <div className="mt-8 grid w-full max-w-xs gap-3 text-left">
        <Row icon={<Camera className="h-4 w-4" />} label="Rear camera" sub="for the live feed" error={cameraError} />
        <Row icon={<MapPin className="h-4 w-4" />} label="Location" sub="to find nearby buildings" error={geoError} />
        <Row icon={<Compass className="h-4 w-4" />} label="Motion + compass" sub="to know where you're looking" />
      </div>

      <button
        type="button"
        onClick={onStart}
        className="mt-8 rounded-full bg-[var(--hud-accent)] px-8 py-3 font-mono-hud text-sm font-semibold uppercase tracking-widest text-[#001218] transition hover:brightness-110"
      >
        Begin
      </button>
      <p className="mt-4 max-w-xs font-mono-hud text-[10px] uppercase text-white/40">
        Tip: hold your phone upright and rotate slowly to calibrate the compass.
      </p>
    </div>
  );
}

function Row({
  icon,
  label,
  sub,
  error,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  error?: string | null;
}) {
  return (
    <div className="hud-pill flex items-center gap-3 rounded-xl px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-[var(--hud-accent)]">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="font-mono-hud text-[10px] text-white/50">{error ?? sub}</div>
      </div>
    </div>
  );
}
