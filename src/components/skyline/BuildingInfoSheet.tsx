import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { BuildingFeature } from "@/lib/overpass";
import { fetchBuildingInfo, type BuildingEnrichment } from "@/lib/wikipedia";
import { ExternalLink, MapPin, Database } from "lucide-react";
import { distanceMeters, type LatLng } from "@/lib/geo";
import type { ReverseGeocodeResult } from "@/lib/reverseGeocode";

interface Props {
  building: BuildingFeature | null;
  onClose: () => void;
  userLocation?: LatLng | null;
  /** Unused now — kept for prop compatibility with the page. */
  allBuildings?: BuildingFeature[];
  /**
   * Lightweight identification result from a tap on an unlabeled spot. When
   * provided (and `building` is null), the sheet renders the amber-tagged
   * "identified by location" mode instead of the normal building info view.
   */
  locationResult?:
    | (ReverseGeocodeResult & { distanceMeters: number; bearingDeg: number })
    | null;
}


const FETCH_TIMEOUT_MS = 4000;

/** Map common OSM `building=*` values to human-readable labels. */
const BUILDING_TYPE_LABELS: Record<string, string> = {
  apartments: "Residential",
  residential: "Residential",
  house: "House",
  detached: "House",
  terrace: "Townhouse",
  hotel: "Hotel",
  office: "Office Tower",
  commercial: "Commercial",
  retail: "Retail",
  industrial: "Industrial",
  warehouse: "Warehouse",
  school: "School",
  university: "University",
  church: "Church",
  cathedral: "Cathedral",
  mosque: "Mosque",
  temple: "Temple",
  synagogue: "Synagogue",
  hospital: "Hospital",
  civic: "Civic",
  government: "Government",
  train_station: "Train Station",
  stadium: "Stadium",
  parking: "Parking Structure",
  yes: "Building",
};

function prettyBuildingType(tags?: Record<string, string>): string | null {
  if (!tags) return null;
  const t = tags.building;
  if (!t) return null;
  if (BUILDING_TYPE_LABELS[t]) return BUILDING_TYPE_LABELS[t];
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fullAddress(tags?: Record<string, string>): string | null {
  if (!tags) return null;
  const hn = tags["addr:housenumber"];
  const street = tags["addr:street"];
  if (hn && street) return `${hn} ${street}`;
  if (street) return street;
  return null;
}

/** "+1973-00-00T00:00:00Z" or "1973-04-01" or "1973" → "1973". */
function yearOnly(s?: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4})/);
  return m ? m[1] : null;
}

function constructFallback(
  building: BuildingFeature,
  type: string | null,
  address: string | null,
  year: string | null,
): string {
  const parts: string[] = [building.name];
  parts.push(" is a");
  if (building.levels) parts.push(` ${building.levels}-floor`);
  parts.push(` ${(type ?? "building").toLowerCase()}`);
  if (year) parts.push(` built in ${year}`);
  if (address) parts.push(`, located at ${address}`);
  if (building.heightMeters) parts.push(`, standing ${Math.round(building.heightMeters)} meters tall`);
  parts.push(".");
  return parts.join("");
}

function copyFeedbackString(building: BuildingFeature) {
  const tags = building.osmTags ?? {};
  const lines = [
    `Incorrect label report`,
    `Name shown: ${building.name}`,
    `OSM id: ${building.id}`,
    `Coordinates: ${building.lat.toFixed(6)}, ${building.lng.toFixed(6)}`,
    tags.building ? `OSM building=${tags.building}` : "",
    `What is it actually? `,
  ].filter(Boolean);
  const text = lines.join("\n");
  try {
    void navigator.clipboard?.writeText(text);
  } catch {
    /* ignore */
  }
}

export function BuildingInfoSheet({ building, onClose, userLocation, locationResult }: Props) {
  const [info, setInfo] = useState<BuildingEnrichment | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!building) return;
    setInfo(null);
    setLoading(true);
    setCopied(false);

    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

    fetchBuildingInfo(
      {
        wikidataId: building.osmTags?.wikidata ?? null,
        name: building.name,
        cityHint: building.osmTags?.["addr:city"],
      },
      ac.signal,
    )
      .then((r) => setInfo(r))
      .catch(() => setInfo(null))
      .finally(() => {
        window.clearTimeout(timer);
        setLoading(false);
      });

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [building]);

  const tags = building?.osmTags;
  const buildingType = useMemo(() => prettyBuildingType(tags), [tags]);
  const address = useMemo(() => fullAddress(tags), [tags]);

  const year =
    yearOnly(info?.yearBuilt) ?? yearOnly(tags?.start_date) ?? null;

  const architect = info?.architect ?? tags?.architect ?? null;
  const style = info?.architecturalStyle ?? null;

  const distanceM = useMemo(() => {
    if (!building || !userLocation) return null;
    return distanceMeters(userLocation, { lat: building.lat, lng: building.lng });
  }, [building, userLocation]);

  const description: string | null = (() => {
    if (loading) return null;
    if (info?.description) return info.description;
    if (tags?.description) return tags.description;
    if (building) return constructFallback(building, buildingType, address, year);
    return null;
  })();

  const heritage = tags?.heritage;
  const heritageOperator = tags?.["heritage:operator"];

  const osmUrl = building
    ? `https://www.openstreetmap.org/?mlat=${building.lat}&mlon=${building.lng}&zoom=18`
    : "";

  const onReport = () => {
    if (!building) return;
    copyFeedbackString(building);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={!!building} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="hud-glass max-h-[85vh] overflow-y-auto rounded-t-3xl border-0 px-6 pb-8 pt-6 text-foreground"
      >
        {/* Identity */}
        <SheetHeader className="text-left">
          <div className="font-mono-hud text-[10px] text-[var(--hud-accent)]">
            STRUCTURE / SELECTED
          </div>
          <SheetTitle className="font-display text-3xl font-semibold uppercase leading-none tracking-wide text-white">
            {building?.name}
          </SheetTitle>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-hud text-[11px] text-white/60">
            {buildingType && <span className="text-white/80">{buildingType}</span>}
            {address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {address}
              </span>
            )}
          </div>
        </SheetHeader>

        {/* Stats strip */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {building?.heightMeters != null && (
            <Pill label="HEIGHT" value={`${Math.round(building.heightMeters)} m`} />
          )}
          {building?.levels != null && <Pill label="FLOORS" value={String(building.levels)} />}
          {year && <Pill label="BUILT" value={year} />}
          {distanceM != null && (
            <Pill
              label="DISTANCE"
              value={
                distanceM > 1000
                  ? `${(distanceM / 1000).toFixed(1)} km`
                  : `${Math.round(distanceM)} m`
              }
            />
          )}
        </div>

        {/* Description */}
        <div className="mt-5 text-sm leading-relaxed text-white/85">
          {loading ? (
            <div className="space-y-2">
              <div className="shimmer h-3 w-full rounded bg-white/10" />
              <div className="shimmer h-3 w-11/12 rounded bg-white/10" />
              <div className="shimmer h-3 w-3/4 rounded bg-white/10" />
            </div>
          ) : (
            <p>{description}</p>
          )}
        </div>

        {/* Architect / style */}
        {(architect || style) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 font-mono-hud text-[11px] text-white/70">
            {architect && (
              <span>
                Designed by <span className="text-white">{architect}</span>
              </span>
            )}
            {style && (
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 uppercase text-white/80">
                {style}
              </span>
            )}
          </div>
        )}

        {/* Heritage */}
        {heritage && (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
            <div className="font-mono-hud text-[10px] uppercase tracking-wider text-amber-300">
              Historic Structure
            </div>
            {heritageOperator && (
              <div className="mt-0.5 font-mono-hud text-[11px] text-amber-100/80">
                {heritageOperator}
              </div>
            )}
          </div>
        )}

        {/* Links */}
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono-hud text-xs uppercase text-white/85 transition hover:bg-white/10"
          >
            <MapPin className="h-3 w-3" /> View on OpenStreetMap
          </a>
          {info?.wikidataUrl && info.wikidataId && (
            <a
              href={info.wikidataUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono-hud text-xs uppercase text-white/85 transition hover:bg-white/10"
            >
              <Database className="h-3 w-3" /> Wikidata
            </a>
          )}
          {info?.wikipediaUrl && (
            <a
              href={info.wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--hud-accent)]/40 bg-[var(--hud-accent)]/10 px-4 py-2 font-mono-hud text-xs uppercase text-[var(--hud-accent)] transition hover:bg-[var(--hud-accent)]/20"
            >
              Wikipedia <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Report incorrect label — single small text link */}
        <div className="mt-5 text-right">
          <button
            onClick={onReport}
            className="font-mono-hud text-[10px] uppercase text-white/40 underline-offset-2 transition hover:text-white/70 hover:underline"
          >
            {copied ? "Copied report to clipboard" : "Report incorrect label"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="font-mono-hud text-[9px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="font-mono-hud text-sm text-white">{value}</div>
    </div>
  );
}
