# SkylineAR

**Point your phone at a city skyline and see what every building is called.** SkylineAR does for cities what PeakFinder does for mountains. It shows live building labels on top of your camera view, using your GPS position, compass heading and open map data. You don't need to install an app or create an account.

**Live app:** https://skyline-sight-seer.lovable.app

---

## How It Works

1. **Open the app on your phone.** SkylineAR asks for camera, location and motion-sensor access on one short permission screen.
2. **The app finds your position.** It gets a GPS fix. You can tap **Locate** at any time to get a fresh, high-accuracy fix.
3. **It downloads an area pack.** Named buildings near you are loaded from OpenStreetMap and saved on your device. Moving around a little won't trigger a new download.
4. **Point the camera.** Labels follow each building's real bearing and height. Each label shows the building's name, height or floor count, and distance. The compass at the top shows which way you're facing.
5. **Tap to learn more.** Tapping a label opens an info sheet with the building type, address, year built, architect, heritage status and a short description. Data comes from Wikidata, Wikipedia and OpenStreetMap.
6. **Tap anything else.** If you tap a spot with no label, the app estimates that location from your compass heading and looks up the address.

On desktop, a **demo mode** shows real skyline data for NYC or other cities. You turn the view with a heading slider.

## Key Capabilities

- **Offline-friendly area packs.** Building data is cached on your device for 30 days. The app tries several Overpass servers and falls back to older cached data if the network fails. Requests are rate-limited by distance moved and by time.
- **Fewer, more accurate labels.** The app scores each building by height and how notable it is. Buildings behind closer, taller buildings are hidden. Labels pointing in nearly the same direction are grouped, and the number of labels on screen is capped.
- **Overlap handling.** Tapping a group of labels spreads them out, and a cycle button steps through the labels near your selection.
- **Digital zoom (1×–3×).** Zooming narrows the field of view and reveals more and smaller buildings. Labels stay the same size, so they're always readable.
- **Sensor accuracy tools:**
  - Magnetic declination correction from NOAA, so labels line up with true north instead of magnetic north
  - Pitch-aware vertical placement, so labels move when you tilt the phone
  - Optional compass calibration and field-of-view (FOV) calibration
  - A floor picker (0–120) that sets your eye height for viewing from high floors
- **Corrections and feedback.** You can mark a label as wrong, choose the right building from nearby candidates, or type a name. Corrections are saved on your device and lower the ranking of wrong matches.
- **Graceful fallbacks.** If you deny camera or location access, if GPS is slow, or if there are no buildings nearby, the app shows a clear screen with a way to retry.

## Tech Stack & Architecture

| Layer | Technology |
| --- | --- |
| Framework | React 19, TanStack Start v1 (file-based routing), Vite 7 |
| Styling | Tailwind CSS v4 (theme tokens in `src/styles.css`), shadcn/ui primitives |
| Hosting | Edge runtime (Cloudflare Workers via `wrangler.jsonc`) |
| Building data | OpenStreetMap Overpass API |
| Enrichment | Wikidata entity API, Wikipedia REST summaries |
| Geocoding / declination | Nominatim reverse geocoding, NOAA geomagnetic calculator |
| Device APIs | `getUserMedia`, Geolocation, DeviceOrientation |

The app runs entirely in the browser. It needs no backend, database or API keys. All positioning math runs on the device: haversine distance, bearing, forward projection and occlusion.

```text
src/
├── routes/index.tsx            Main AR screen: wires sensors, data and UI
├── components/skyline/
│   ├── AROverlay.tsx           Projection, filtering, clustering, label layout
│   ├── BuildingInfoSheet.tsx   Bottom-sheet details and corrections
│   ├── CompassHUD.tsx          Heading indicator
│   ├── CompassCalibration.tsx  Compass offset flow
│   ├── FOVCalibration.tsx      Two-landmark field-of-view calibration
│   └── PermissionGate.tsx      Permission and fallback screens
├── hooks/
│   ├── useAreaPack.ts          Cache-first, rate-limited building loading
│   ├── useCamera.ts            Rear camera stream
│   ├── useDeviceOrientation.ts Heading, tilt, declination correction
│   └── useGeolocation.ts       GPS fixes and manual refresh
└── lib/
    ├── geo.ts                  Distance, bearing, destination-point math
    ├── overpass.ts             Overpass queries, mirrors, tag parsing
    ├── wikidata.ts / wikipedia.ts  Enrichment lookups with caching
    ├── reverseGeocode.ts       Nominatim lookups for unlabeled taps
    └── feedback.ts             Local correction storage and scoring
```

## Local Development

You need [Bun](https://bun.sh) or Node.js 20+.

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
cp .env.example .env   # optional: no variables are currently required
bun run dev
```

Then open the local URL that Vite prints. Camera and motion sensors only work in a secure context (HTTPS or `localhost`). To test on a real phone, use a tunnel or deploy a preview build.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the dev server |
| `bun run build` | Production build |
| `bun run preview` | Preview the production build |
| `bun run lint` | Lint with ESLint |
| `bun run format` | Format with Prettier |

## Roadmap

- **Shared corrections.** Sync user corrections to a shared store so everyone's labels get more accurate over time.
- **Image-assisted matching.** Use on-device vision to match labels to the building outlines the camera actually sees, not just compass bearing.
- **Map pack manager.** Let users see, pre-download and delete area packs for trips.
- **Snapshot sharing.** Capture the camera view with its labels as an image to share.

## Data & Attribution

Building data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Descriptions come from Wikidata (CC0) and Wikipedia (CC BY-SA). Declination data comes from NOAA NCEI.
