import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  DEMO_BUILDINGS,
  DEMO_LOCATION,
  fetchNearbyBuildings,
  type BuildingFeature,
} from "@/lib/overpass";
import { AROverlay } from "@/components/skyline/AROverlay";
import { CompassHUD } from "@/components/skyline/CompassHUD";
import { BuildingInfoSheet } from "@/components/skyline/BuildingInfoSheet";
import { PermissionGate } from "@/components/skyline/PermissionGate";
import { Loader2, Smartphone, RotateCw } from "lucide-react";

export const Route = createFileRoute("/")({
  component: SkylineARPage,
});

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function SkylineARPage() {
  const [started, setStarted] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoHeading, setDemoHeading] = useState(180);
  const [selected, setSelected] = useState<BuildingFeature | null>(null);
  const [buildings, setBuildings] = useState<BuildingFeature[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const mobile = useMemo(isMobile, []);

  const { videoRef, error: camError, ready: camReady } = useCamera(started && !demoMode);
  const orientation = useDeviceOrientation();
  const geo = useGeolocation(started && !demoMode);

  const userPos = demoMode ? DEMO_LOCATION : geo.position;
  const heading = demoMode ? demoHeading : orientation.heading;

  // Start handler — request permissions
  const handleStart = async () => {
    setStarted(true);
    await orientation.request();
  };

  // Fetch buildings when position is known
  useEffect(() => {
    if (demoMode) {
      setBuildings(DEMO_BUILDINGS);
      return;
    }
    if (!userPos) return;
    const ac = new AbortController();
    setLoadingBuildings(true);
    setFetchError(null);
    fetchNearbyBuildings(userPos, 5000, ac.signal)
      .then((b) => setBuildings(b))
      .catch((e) => {
        if (e.name !== "AbortError") setFetchError(e.message ?? "Fetch failed");
      })
      .finally(() => setLoadingBuildings(false));
    return () => ac.abort();
  }, [userPos?.lat?.toFixed(3), userPos?.lng?.toFixed(3), demoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop auto demo
  useEffect(() => {
    if (started && !mobile && !demoMode) {
      setDemoMode(true);
    }
  }, [started, mobile, demoMode]);

  if (!started) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <BackgroundGlow />
        <PermissionGate onStart={handleStart} />
      </main>
    );
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      {/* Camera feed */}
      {!demoMode && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {demoMode && <DemoBackdrop />}

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.7)_100%)]" />

      {/* Desktop banner */}
      {demoMode && (
        <div className="absolute left-1/2 top-20 z-10 -translate-x-1/2 hud-pill flex items-center gap-2 rounded-full px-4 py-1.5 font-mono-hud text-[10px] uppercase text-white/80">
          <Smartphone className="h-3 w-3 text-[var(--hud-accent)]" />
          Demo mode · designed for mobile
        </div>
      )}

      {/* Errors */}
      {!demoMode && camError && (
        <ErrorBanner
          title="Camera unavailable"
          msg={camError}
          action={() => setDemoMode(true)}
          actionLabel="Use demo mode"
        />
      )}
      {!demoMode && geo.error && !camError && (
        <ErrorBanner
          title="Location unavailable"
          msg={geo.error}
          action={() => setDemoMode(true)}
          actionLabel="Use demo mode"
        />
      )}

      {/* Compass HUD */}
      <CompassHUD heading={heading} />

      {/* Loading state */}
      {!demoMode && (loadingBuildings || !camReady || heading == null || !userPos) && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--hud-accent)]" />
          <div className="font-mono-hud text-[10px] uppercase tracking-widest text-white/70">
            {!camReady && "Starting camera…"}
            {camReady && !userPos && "Acquiring GPS…"}
            {camReady && userPos && heading == null && "Calibrate compass — rotate phone in figure-8"}
            {camReady && userPos && heading != null && loadingBuildings && "Scanning skyline…"}
          </div>
        </div>
      )}

      {/* AR Overlay */}
      {userPos && heading != null && buildings.length > 0 && (
        <AROverlay
          user={userPos}
          heading={heading}
          buildings={buildings}
          selectedId={selected?.id ?? null}
          onSelect={(b) => setSelected(b)}
        />
      )}

      {/* Empty state */}
      {!loadingBuildings && userPos && buildings.length === 0 && !fetchError && (
        <CenterMsg msg="No named buildings found nearby. Try moving to a city center." />
      )}
      {fetchError && <CenterMsg msg={`Couldn't reach building data. ${fetchError}`} />}

      {/* Demo heading slider */}
      {demoMode && (
        <div className="absolute bottom-6 left-1/2 z-10 w-[min(420px,90vw)] -translate-x-1/2 hud-pill rounded-full px-5 py-3">
          <div className="mb-1.5 flex items-center justify-between font-mono-hud text-[10px] uppercase text-white/60">
            <span className="flex items-center gap-1.5">
              <RotateCw className="h-3 w-3" /> Pan view
            </span>
            <span className="text-[var(--hud-accent)]">{Math.round(demoHeading)}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={demoHeading}
            onChange={(e) => setDemoHeading(parseInt(e.target.value))}
            className="w-full accent-[var(--hud-accent)]"
          />
        </div>
      )}

      <BuildingInfoSheet building={selected} onClose={() => setSelected(null)} />
    </main>
  );
}

function ErrorBanner({
  title,
  msg,
  action,
  actionLabel,
}: {
  title: string;
  msg: string;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div className="absolute left-1/2 top-24 z-20 w-[min(360px,90vw)] -translate-x-1/2 hud-pill rounded-2xl p-4 text-center">
      <div className="font-display text-base font-semibold text-white">{title}</div>
      <div className="mt-1 font-mono-hud text-[10px] text-white/60">{msg}</div>
      <button
        onClick={action}
        className="mt-3 rounded-full bg-[var(--hud-accent)] px-4 py-1.5 font-mono-hud text-[10px] uppercase text-[#001218]"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function CenterMsg({ msg }: { msg: string }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[min(360px,90vw)] -translate-x-1/2 -translate-y-1/2 hud-pill rounded-2xl p-4 text-center font-mono-hud text-xs text-white/80">
      {msg}
    </div>
  );
}

function BackgroundGlow() {
  return (
    <>
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-[var(--hud-accent)]/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-[var(--hud-accent)]/10 blur-[120px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
    </>
  );
}

function DemoBackdrop() {
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #0a1420 0%, #0a1420 55%, #1a2a3a 75%, #2a3a4a 100%)",
        }}
      />
      {/* Skyline silhouette */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 1200 300"
        preserveAspectRatio="none"
        style={{ height: "45%" }}
      >
        <defs>
          <linearGradient id="bldg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d1825" />
            <stop offset="100%" stopColor="#000" />
          </linearGradient>
        </defs>
        <path
          fill="url(#bldg)"
          d="M0,300 L0,180 L60,180 L60,120 L120,120 L120,200 L180,200 L180,80 L240,80 L240,160 L300,160 L300,40 L360,40 L360,140 L420,140 L420,100 L480,100 L480,180 L540,180 L540,60 L600,60 L600,170 L660,170 L660,110 L720,110 L720,30 L780,30 L780,150 L840,150 L840,90 L900,90 L900,190 L960,190 L960,130 L1020,130 L1020,70 L1080,70 L1080,180 L1140,180 L1140,140 L1200,140 L1200,300 Z"
        />
      </svg>
      {/* Stars */}
      {Array.from({ length: 60 }).map((_, i) => (
        <div
          key={i}
          className="absolute h-px w-px bg-white"
          style={{
            left: `${(i * 53) % 100}%`,
            top: `${(i * 31) % 50}%`,
            opacity: 0.3 + ((i * 7) % 7) / 10,
          }}
        />
      ))}
    </div>
  );
}
