interface Props {
  heading: number | null;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function cardinal(h: number) {
  return CARDINALS[Math.round(h / 45) % 8];
}

export function CompassHUD({ heading }: Props) {
  const h = heading ?? 0;
  const ticks = Array.from({ length: 24 }, (_, i) => i * 15);

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
      <div className="hud-pill flex items-center gap-3 rounded-full px-4 py-2">
        <span className="font-mono-hud text-xs text-white/70">HDG</span>
        <span className="font-display text-lg font-semibold text-white">
          {heading == null ? "—" : `${Math.round(h)}°`}
        </span>
        <span className="font-mono-hud text-xs text-[var(--hud-accent)]">
          {heading == null ? "" : cardinal(h)}
        </span>
      </div>
      {heading != null && (
        <div className="relative mt-2 h-6 w-64 overflow-hidden">
          <div
            className="absolute inset-y-0 flex"
            style={{
              transform: `translateX(${-((h / 360) * 24 * 32) + 128 - 16}px)`,
            }}
          >
            {[...ticks, ...ticks].map((t, i) => (
              <div key={i} className="flex w-8 flex-col items-center">
                <div
                  className={`w-px ${t % 90 === 0 ? "h-3 bg-[var(--hud-accent)]" : "h-2 bg-white/40"}`}
                />
                {t % 90 === 0 && (
                  <span className="mt-0.5 font-mono-hud text-[8px] text-white/60">
                    {CARDINALS[(t / 45) % 8]}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-[var(--hud-accent)]" />
          <div
            className="absolute inset-y-0 left-0 w-8"
            style={{ background: "linear-gradient(90deg, rgba(8,12,20,0.9), transparent)" }}
          />
          <div
            className="absolute inset-y-0 right-0 w-8"
            style={{ background: "linear-gradient(270deg, rgba(8,12,20,0.9), transparent)" }}
          />
        </div>
      )}
    </div>
  );
}
