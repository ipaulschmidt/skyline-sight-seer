# Skyline AR Viewer

Here’s your Lovable/v0 prompt, ready to paste:

PROMPT:

Build a web-based AR city skyline viewer called SkylineAR — the urban equivalent of PeakFinder. When a user opens the app on their phone, it activates the rear camera and overlays labeled building markers on the live video feed based on their GPS position and compass heading.

Core Functionality

	1.	Camera + AR Overlay

	•	Use getUserMedia to stream the rear camera as a full-screen background

	•	Use the DeviceOrientation API (compass heading + pitch/tilt) to determine what direction the user is facing

	•	Use the Geolocation API to get the user’s current lat/lng

	2.	Building Data

	•	Fetch nearby buildings from the OpenStreetMap Overpass API using this endpoint: https://overpass-api.de/api/interpreter

	•	Query for building nodes/ways within a 5km radius that have name and height or building:levels tags

	•	Calculate bearing and distance from user to each building

	•	Only render buildings within the current field of view (~60° horizontal FOV)

	3.	AR Label Rendering

	•	Project each in-range building into 2D screen coordinates based on compass bearing offset from screen center

	•	Render as floating label cards above the building’s horizon position

	•	Each label shows: Building Name (large) + Height in meters / floors (small) + a thin vertical line dropping to the horizon

	•	Labels should scale slightly with distance (closer = slightly larger)

	•	Use a <canvas> or absolutely-positioned <div> overlay on top of the video feed

	4.	Tap to Info Card

	•	Tapping a label pauses the overlay and opens a bottom sheet info card

	•	The card fetches a summary from the Wikipedia API: https://en.wikipedia.org/api/rest_v1/page/summary/{building_name}

	•	Info card shows: building name, Wikipedia extract (2–3 sentences), height, and a “Read more on Wikipedia” link

	•	Card dismisses on tap outside or swipe down

UI / Visual Design

	•	Dark, cinematic aesthetic — think heads-up display / mission control

	•	Overlay labels: white text, thin 1px white line, semi-transparent dark pill background with subtle backdrop blur

	•	Selected building label: accent highlight in electric blue #00BFFF

	•	Bottom info card: dark glass morphism panel, rounded top corners, building name in a tall condensed display font, body text in a clean mono or sans

	•	Compass/heading indicator at the top center of the screen showing current bearing in degrees

	•	Small “calibrate compass” nudge prompt on first load

	•	Permission screens for camera and location should be minimal and on-brand

Permissions + Edge Cases

	•	Handle camera permission denied gracefully with a fallback screen

	•	Handle geolocation unavailable or denied

	•	If no building data returns for a location, show: “No named buildings found nearby. Try moving to a city center.”

	•	Add a loading shimmer state while Overpass data fetches

	•	Desktop fallback: show a static demo mode using NYC buildings with a “This experience is designed for mobile” banner

Tech Stack

	•	React + Tailwind

	•	No AR framework needed — pure CSS/canvas overlay on video stream

	•	Fetch from Overpass API and Wikipedia REST API directly (no backend needed)

	•	All positioning math done in the browser using bearing calculations (haversine formula for distance, atan2 for bearing)

Out of Scope for MVP

	•	No user accounts

	•	No 3D building models

	•	No indoor positioning

	•	No historical/cultural filters

That prompt gives Lovable enough architectural specificity to not hallucinate the data layer, while leaving the visual execution open for it to run with. The Overpass + Wikipedia combo is fully free, no API keys needed, which keeps the prototype self-contained.

Want me to also write the bearing/projection math as a standalone JS snippet you can drop in if Lovable gets that part wrong?

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://skyline-sight-seer.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a0295c6a-967c-4f93-8bf1-92aace6e3536).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
