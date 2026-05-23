/**
 * Lightweight reverse geocoding via Nominatim (OpenStreetMap).
 * Used for the "tap an unlabeled building" identification flow — returns a
 * best-effort label, never throws, 3-second timeout.
 */

export interface ReverseGeocodeResult {
  displayName: string;
  buildingName: string | null;
  fullAddress: string | null;
  osmType: string | null;
  osmId: number | null;
  lat: number;
  lng: number;
  identified: boolean;
}

const TIMEOUT_MS = 3000;

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&namedetails=1&zoom=18`;
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        // Nominatim usage policy: identify the client.
        "User-Agent": "SkylineSightSeer/1.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const addr = j.address ?? {};
    const names = j.namedetails ?? {};

    const buildingName: string | null =
      names.name ?? addr.building ?? j.name ?? null;

    const street = addr.road ?? addr.pedestrian ?? null;
    const houseNumber = addr.house_number ?? null;
    const neighborhood =
      addr.neighbourhood ?? addr.suburb ?? addr.quarter ?? null;

    let displayName = "Unknown Structure";
    if (street && houseNumber) displayName = `${houseNumber} ${street}`;
    else if (street) displayName = street;
    else if (neighborhood) displayName = neighborhood;
    else if (j.display_name) displayName = String(j.display_name).split(",")[0];

    const fullAddressParts = [
      houseNumber,
      street,
      addr.suburb ?? addr.neighbourhood,
    ].filter(Boolean);
    const fullAddress = fullAddressParts.length
      ? fullAddressParts.join(" ").replace(/^(\S+)\s(\S+)\s/, "$1 $2, ")
      : null;

    return {
      displayName,
      buildingName,
      fullAddress,
      osmType: j.osm_type ?? null,
      osmId: typeof j.osm_id === "number" ? j.osm_id : null,
      lat: typeof j.lat === "string" ? parseFloat(j.lat) : lat,
      lng: typeof j.lon === "string" ? parseFloat(j.lon) : lng,
      identified: true,
    };
  } catch {
    return {
      displayName: "Unknown Structure",
      buildingName: null,
      fullAddress: null,
      osmType: null,
      osmId: null,
      lat,
      lng,
      identified: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
