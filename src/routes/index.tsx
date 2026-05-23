import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAreaPack } from "@/hooks/useAreaPack";
import {
  DEMO_BUILDINGS,
  DEMO_CITIES,
  DEMO_LOCATION,
  type BuildingFeature,
  type LoadStatus,
} from "@/lib/overpass";
import type { LatLng } from "@/lib/geo";
import { AROverlay, pickBuildingAtBearing } from "@/components/skyline/AROverlay";
import { CompassHUD } from "@/components/skyline/CompassHUD";
import { BuildingInfoSheet } from "@/components/skyline/BuildingInfoSheet";
import { PermissionGate } from "@/components/skyline/PermissionGate";
import { Loader2, Smartphone, RotateCw, Download, MapPin, CheckCircle2, RefreshCw, ZoomIn, ZoomOut, Crosshair } from "lucide-react";

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
  const [demoCity, setDemoCity] = useState<LatLng>(DEMO_LOCATION);
  const [demoHeading, setDemoHeading] = useState(180);
  const [selected, setSelected] = useState<BuildingFeature | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [zoom, setZoom] = useState(1); // 1x .. 3x; narrows FOV and scales video
  const [tapMode, setTapMode] = useState(false);

  const mobile = useMemo(isMobile, []);

  const { videoRef, error: camError, ready: camReady } = useCamera(started && !demoMode);
  const orientation = useDeviceOrientation();
  const geo = useGeolocation(started && !demoMode);

  const userPos = demoMode ? demoCity : geo.position;
  const heading = demoMode ? demoHeading : orientation.heading;

  const handleStart = async () => {
    setStarted(true);
    await orientation.request();
  };

  // Smart fetcher: cache-first, distance-gated, throttled, debounced
  const pack = useAreaPack(userPos, {
    enabled: !!userPos,
    minMoveMeters: 400,    // ignore GPS jitter under ~400m
    minIntervalMs: 30_000, // at most one network fetch per 30s
    debounceMs: 1500,      // wait 1.5s of stability before fetching
    radiusMeters: 5000,
  });

  // Final fallback so the screen is never empty
  const buildings: BuildingFeature[] =
    pack.buildings.length > 0
      ? pack.buildings
      : pack.error
        ? DEMO_BUILDINGS
        : [];
  const packStatus: LoadStatus | null = pack.status;
  const fetchError = pack.error;
  const packFromCache = pack.fromCache;

  // Desktop auto-demo
  useEffect(() => {
    if (started && !mobile && !demoMode) setDemoMode(true);
  }, [started, mobile, demoMode]);

  const retryPack = () => pack.refresh();

  const pickCity = (loc: LatLng) => {
    setDemoCity(loc);
    setDemoMode(true);
    setShowCityPicker(false);
  };

  if (!started) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <BackgroundGlow />
        <PermissionGate onStart={handleStart} />
      </main>
    );
  }

  const gpsStuck = !demoMode && (geo.timedOut || (geo.error && !geo.position));

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
          Demo mode · {nearestCityLabel(demoCity)}
        </div>
      )}

      {/* Camera error */}
      {!demoMode && camError && (
        <ErrorBanner
          title="Camera unavailable"
          msg={camError}
          action={() => setDemoMode(true)}
          actionLabel="Use demo mode"
        />
      )}

      {/* GPS stuck → offer escape hatches */}
      {gpsStuck && !camError && (
        <ErrorBanner
          title={geo.timedOut ? "GPS is taking too long" : "Location unavailable"}
          msg={
            geo.error ??
            "Some browsers (Safari in private mode, iframes, desktop) block geolocation. You can pick a city to explore instead."
          }
          action={() => setShowCityPicker(true)}
          actionLabel="Pick a city"
        />
      )}

      {/* Compass HUD */}
      <CompassHUD heading={heading} />

      {/* Pack status pill (top-left) */}
      {userPos && (
        <PackPill status={packStatus} fromCache={packFromCache} count={buildings.length} />
      )}

      {/* Loading state */}
      {!demoMode && !gpsStuck && (!camReady || heading == null || !userPos) && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--hud-accent)]" />
          <div className="font-mono-hud text-[10px] uppercase tracking-widest text-white/70">
            {!camReady && "Starting camera…"}
            {camReady && !userPos && "Acquiring GPS…"}
            {camReady && userPos && heading == null && "Calibrate compass — rotate phone in figure-8"}
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

      {/* Empty / error */}
      {userPos &&
        packStatus?.kind !== "downloading" &&
        buildings.length === 0 &&
        !fetchError && (
          <CenterMsg
            msg="No named buildings found nearby. Try moving to a city center."
            actionLabel="Try another city"
            onAction={() => setShowCityPicker(true)}
          />
        )}
      {fetchError && (
        <CenterMsg
          msg={`Couldn't reach building data: ${fetchError}`}
          actionLabel="Retry download"
          onAction={retryPack}
          secondaryLabel="Pick a city"
          onSecondary={() => setShowCityPicker(true)}
        />
      )}

      {/* Demo heading slider */}
      {demoMode && (
        <div className="absolute bottom-6 left-1/2 z-10 w-[min(420px,90vw)] -translate-x-1/2 hud-pill rounded-full px-5 py-3">
          <div className="mb-1.5 flex items-center justify-between font-mono-hud text-[10px] uppercase text-white/60">
            <span className="flex items-center gap-1.5">
              <RotateCw className="h-3 w-3" /> Pan view
            </span>
            <button
              onClick={() => setShowCityPicker(true)}
              className="flex items-center gap-1 text-[var(--hud-accent)] hover:underline"
            >
              <MapPin className="h-3 w-3" /> Change city
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={demoHeading}
            onChange={(e) => setDemoHeading(parseInt(e.target.value))}
            className="w-full accent-[var(--hud-accent)]"
          />
          <div className="mt-1 text-right font-mono-hud text-[10px] text-[var(--hud-accent)]">
            {Math.round(demoHeading)}°
          </div>
        </div>
      )}

      {showCityPicker && (
        <CityPicker
          onPick={pickCity}
          onClose={() => setShowCityPicker(false)}
        />
      )}

      <BuildingInfoSheet building={selected} onClose={() => setSelected(null)} />
    </main>
  );
}

/* ---------- subcomponents ---------- */

function PackPill({
  status,
  fromCache,
  count,
}: {
  status: LoadStatus | null;
  fromCache: boolean;
  count: number;
}) {
  if (!status) return null;

  let icon = <Loader2 className="h-3 w-3 animate-spin" />;
  let label = "Preparing area pack…";
  let tone = "text-white/70";

  if (status.kind === "downloading") {
    icon = <Download className="h-3 w-3 animate-pulse" />;
    label = status.attempt
      ? `Downloading area pack · mirror ${status.attempt}/3`
      : "Downloading area pack…";
  } else if (status.kind === "downloaded") {
    icon = <CheckCircle2 className="h-3 w-3" />;
    label = `Area pack ready · ${count} buildings`;
    tone = "text-[var(--hud-accent)]";
  } else if (status.kind === "cache-hit") {
    icon = <CheckCircle2 className="h-3 w-3" />;
    label = fromCache
      ? `Cached pack · ${count} buildings`
      : `Area pack ready · ${count} buildings`;
    tone = "text-[var(--hud-accent)]";
  } else if (status.kind === "failed") {
    icon = <RefreshCw className="h-3 w-3" />;
    label = "Area pack failed";
    tone = "text-red-300";
  }

  return (
    <div
      className={`absolute left-4 top-20 z-10 hud-pill flex items-center gap-2 rounded-full px-3 py-1.5 font-mono-hud text-[10px] uppercase ${tone}`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function CityPicker({
  onPick,
  onClose,
}: {
  onPick: (loc: LatLng) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="hud-pill w-[min(420px,92vw)] rounded-3xl p-6">
        <div className="mb-1 font-display text-xl font-semibold text-white">Pick a city</div>
        <div className="mb-4 font-mono-hud text-[10px] uppercase text-white/60">
          We'll download its skyline pack
        </div>
        <div className="grid grid-cols-1 gap-2">
          {DEMO_CITIES.map((c) => (
            <button
              key={c.name}
              onClick={() => onPick(c.location)}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white transition hover:border-[var(--hud-accent)]/60 hover:bg-white/10"
            >
              <span>{c.name}</span>
              <MapPin className="h-4 w-4 text-[var(--hud-accent)]" />
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-white/10 px-4 py-2 font-mono-hud text-[10px] uppercase text-white/70"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function nearestCityLabel(loc: LatLng): string {
  let best = DEMO_CITIES[0];
  let bestD = Infinity;
  for (const c of DEMO_CITIES) {
    const d = Math.hypot(c.location.lat - loc.lat, c.location.lng - loc.lng);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.name;
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

function CenterMsg({
  msg,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  msg: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="absolute left-1/2 top-1/2 z-10 w-[min(360px,90vw)] -translate-x-1/2 -translate-y-1/2 hud-pill rounded-2xl p-4 text-center font-mono-hud text-xs text-white/80">
      <div>{msg}</div>
      {(actionLabel || secondaryLabel) && (
        <div className="mt-3 flex justify-center gap-2">
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="rounded-full bg-[var(--hud-accent)] px-4 py-1.5 text-[10px] uppercase text-[#001218]"
            >
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="rounded-full bg-white/10 px-4 py-1.5 text-[10px] uppercase text-white/80"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
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
