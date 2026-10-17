# World bible: The Tower

Dated 18.10.2026. Describes the code as built; source of truth is `src/world/chapters.ts` and `src/world/floors/kit.ts`.

## World sentence and interaction contract

You climb a night-lit engineering tower in Cologne, one floor per skill, from the wet street to the roof beacon at dawn, and the only input is native scroll.

- Scroll position is the single driver. Everything else (hover, focus, press) is optional and never gates content.
- Every 3D hotspot has a real DOM button with the same id, kept in sync both ways.
- Reduced motion snaps to the exact chapter and freezes scene clocks.

## Visual bible

**Scale.** 1 unit is 1 m, y up. Tower footprint x, z in [-7, 7], floor height 4, slab 0.35. The front facade (z = +7) is a cutaway of thin mullions and slab edges, so floors are visible from outside. Floor bases: frontend 0, backend 4, cloud 8, data 12, ai-core 16, rocket 20 (open deck cantilevered east, x 7 to 15), teaching 24, roof and lounge 28, antenna mast to y 40. Street plane at y = 0 with a Cologne skyline and a distant twin-spire cathedral.

**Palette roles.**

| Role | Hex |
|---|---|
| Night | #0A0E17 |
| Concrete | #2B3039 |
| Steel | #1A1D23 |
| Readable | #E9E5DB |
| Practical warm | #FFB25E |
| Signal blue | #2F58FF |
| Fusion red | #E5392B |
| Dawn | #F4C9A0 |

**Lens.** Mostly a human eye-height lens (fov 50 to 58) inside the stops, a long 28 degree lens for the index elevation, 42 to 43 degrees for the about and say-hi wides. Mobile widens fov by 4 to 14 degrees and pulls back.

## Chapter ledger

Floor label is the building level that the chapter focuses.

| Chapter | Floor | Landmark | Change | Weight | Focus | Interactions |
|---|---|---|---|---|---|---|
| hero | street | Whole tower from the wet street, only the workshop door glowing | Rain falls, street reflects the ground floor, floors above dark | 1.2 | street, frontend | none |
| index | elevation | Cutaway elevation, seven floors above the street | Long lens lift, floors light up one after another | 1.4 | street, frontend to teaching | index-floor-0 to 6 |
| stop-frontend | 0 | Three glass walls in the atelier showing client sites | Eye height at the open front, warm lamps, rain thinning | 1.3 | frontend | frontend-hih, frontend-baysal, frontend-fakhari |
| stop-backend | 4 | Four rack rows with Kafka pipes carrying packets | Camera rises one floor, tracks diagonally from the east corner | 1.2 | backend | none |
| stop-cloud | 8 | Container stacks on a blueprint grid beside the stair core | Crosses to the west, looks up the stairs | 1.2 | cloud | none |
| stop-data | 12 | Four delivery pipes meeting at a tank, red alarm lamp | Swings east under the ceiling, looks down on the confluence | 1.2 | data | none |
| stop-ai-products | 16 | AI core with orbit ring: retrieve, reason, act, evaluate | Quarter orbit to the west front corner | 1.2 | ai-core | none |
| stop-ai-coding | 20 | Fusion rocket on the east launch deck, seen from below | Light turns fusion red, rocket lifts off | 1.6 | rocket | rocket-launch |
| stop-teaching | 24 | Spiral of twenty lights in the glass crown, four rings | Follows the rocket up, looks down into the spiral | 1.3 | teaching | none |
| about | 28 | Six metre light wall with portrait above DJ booth and homelab rack | Clears the parapet at blue hour, wall powers up | 1.4 | lounge | lounge-service-0 to 9 |
| say-hi | mast | Lattice antenna mast with slow warm beacon, Cologne at dawn | Wide pullback, beacon sweeps, sky turns to morning | 1.2 | beacon | say-hi-beacon |

World channels per chapter (key / ambient / practicals / fog / rain / red / dawn / bloom / launch):

| Chapter | key | amb | prac | fog | rain | red | dawn | bloom | launch |
|---|---|---|---|---|---|---|---|---|---|
| hero | 0.45 | 0.3 | 0.35 | 0.45 | 1 | 0 | 0 | 0 | 0 |
| index | 0.55 | 0.35 | 0.5 | 0.35 | 0.7 | 0 | 0 | 0 | 0 |
| stop-frontend | 0.6 | 0.5 | 1 | 0.25 | 0.4 | 0 | 0 | 0 | 0 |
| stop-backend | 0.55 | 0.45 | 1 | 0.28 | 0.4 | 0 | 0 | 0 | 0 |
| stop-cloud | 0.6 | 0.5 | 0.95 | 0.3 | 0.3 | 0 | 0 | 0 | 0 |
| stop-data | 0.55 | 0.45 | 1 | 0.3 | 0.25 | 0 | 0 | 0 | 0 |
| stop-ai-products | 0.6 | 0.5 | 1 | 0.28 | 0.2 | 0 | 0 | 0 | 0 |
| stop-ai-coding | 0.5 | 0.3 | 0.6 | 0.32 | 0.1 | 1 | 0 | 0.8 | 0 |
| stop-teaching | 0.55 | 0.35 | 0.8 | 0.3 | 0 | 0.25 | 0.15 | 0.55 | 1 |
| about | 0.45 | 0.4 | 0.85 | 0.2 | 0 | 0 | 0.45 | 0.35 | 1 |
| say-hi | 0.9 | 0.55 | 0.7 | 0.15 | 0 | 0 | 1 | 0.45 | 1 |

`floorsLit` is 1 in hero and index in the ledger and 7 from stop-frontend on; the index cascade is interpolated between these values. `pulse` is 0 in every chapter.

## Camera ledger

Positions and targets in metres; "approach" is the entry point before the chapter camera.

| Chapter | Desktop position | Desktop target | fov | Mobile position | Mobile target | Mobile fov |
|---|---|---|---|---|---|---|
| hero | -6, 1.7, 34 | 0, 15, 0 | 58 | -4, 3, 58 | 0, 14.6, 0 | 69 |
| index | 52, 22, 62 | 2, 14, 0 | 28 | 60, 26, 84 | 3, 13.2, 0 | 42 |
| stop-frontend | -2.4, 1.65, 8.6 | 0.5, 1.6, -2.5 | 58 | -1, 1.7, 12 | 0.5, 1.6, -2.5 | 62 |
| stop-backend | 2, 6.1, 8.9 | 0.8, 5, -3 | 52 | 1.8, 6, 9.4 | 1.2, 5, -3 | 56 |
| stop-cloud | -1.6, 10.2, 8.64 | -5, 9.6, 0.8 | 52 | -4, 10.3, 8.6 | -5.2, 8.6, 1 | 60 |
| stop-data | -0.8, 15.2, 8.7 | 1.6, 13.3, -0.2 | 54 | 0, 15.2, 8.6 | 1.4, 13.2, 0.4 | 62 |
| stop-ai-products | -7, 17.8, 8.6 | 0, 17.6, -0.5 | 50 | -6, 17.9, 11.5 | 0, 17.6, -0.5 | 60 |
| stop-ai-coding | 13, 18.8, 8 | 11, 24.5, 0 | 50 | 13.5, 18.6, 11 | 11, 24.8, 0 | 66 |
| stop-teaching | 2, 27.3, 8.4 | -0.5, 24.6, -0.5 | 50 | 1.5, 27.3, 13 | -0.5, 24.8, -0.5 | 60 |
| about | 4.4, 29.8, 8.2 | 2.3, 31.5, -5.4 | 43 | 3.1, 30.4, 12.2 | 2.6, 31.6, -5.4 | 58 |
| say-hi | -19, 25.5, 50 | -2.5, 32.5, -3.5 | 42 | -22, 24, 70 | -2.5, 31, -3.5 | 50 |

Approach points (desktop / mobile): frontend (-3.4, 2.4, 13.5) / (-1.8, 2.3, 16); backend (-0.2, 3.9, 10.8) / (0.4, 3.9, 12.4); cloud (0.2, 8.1, 10.8) / (-1.1, 8.1, 11.6); data (-1.4, 12.4, 10.8) / (-1.4, 12.4, 11.4); ai-products (-4, 16.6, 10.8) / (-3.2, 16.6, 12.2); ai-coding (3, 18.6, 11.5) / (3.5, 18.4, 13.5); teaching (7.5, 23.2, 11) / (7.8, 23, 13.5); about (3.6, 28.5, 11.4) / (2.6, 28.6, 14.6). Hero, index and say-hi have none.

## Material and lighting ledger

Materials (`floors/kit.ts`):

- Concrete and worn concrete: standard material with procedural 1K concrete texture and a shader patch for breakup, damp, wet and polish wear.
- Steel `#3A3E44`, metalness 0.78, roughness 0.46. Brass `#B08A52`, metalness 1, roughness 0.34.
- Glass `#9fb2c8` with per-use opacity.
- Screens: near-black base lit by an emissive map (work screenshots, portrait) at the screen luminance.
- Emitters: basic materials scaled above 1 for bulbs and bloom-ready surfaces; beams, halos and flow pulses are additive shader materials.
- Textures are procedural canvases at 1024 px (concrete, blueprint, slab) plus the loaded work and portrait images.

Lighting: one key light, one hemisphere light, and a ledger of six lanes of practical point lights. Each ledger light has a position, colour, intensity, distance and a chapter window that rises and falls with progress, so only the lights near the camera are on. Lane reuse keeps the live count at six. Light levels are practical, screen and street.

No-flash rule, enforced in code (`breathLimits`, `calmLight`):

- Breath period at least 3.5 s (`minimumPeriod`)
- Amplitude at most 20 % (`maximumDepth`, `maxSwing`)
- At most one flash per second
- Reduced motion freezes the scene clock

Current breathers: data alarm (period 4 s, depth 0.2) and AI core signal (period 4.8 s, depth 0.12). The 124 bpm `pulse` channel stays at 0 in every chapter, so no beat-synced flashing ships.

## Interaction matrix

| Id | Chapter | 3D proxy | DOM proxy | Effect |
|---|---|---|---|---|
| index-floor-0 to 6 | index | Floor slabs of the elevation | `button.hotspot` per floor | Scrolls to the matching stop chapter |
| frontend-hih, frontend-baysal, frontend-fakhari | stop-frontend | Three glass walls | `button.hotspot` each | Focuses the wall and shows the client site |
| rocket-launch | stop-ai-coding | Rocket | `button.hotspot` | Replays the launch flourish |
| lounge-service-0 to 9 | about | Homelab rack LEDs | `button.hotspot` each | Shows the service readout |
| say-hi-beacon | say-hi | Antenna beacon | `button.hotspot` | Copies the email address |

## Performance budget

- At most 160 draw calls on desktop
- At most 10 point lights live at any time
- Textures at most 1K
- Bloom only from stop-ai-coding on (the bloom channel is 0 before it; the bloom chain runs only while the channel is above 0.01, strength capped at 0.9)
- Mobile gets the medium tier or lower

## Quality tiers (`src/world/quality.ts`)

| Tier | Pixel ratio | Shadow map | Particles | Bloom | Antialias |
|---|---|---|---|---|---|
| high | 1.75 | 2048 | 1 | yes | yes |
| medium | 1.35 | 1024 | 0.55 | yes | yes |
| low | 1 | off | 0.2 | no | no |

Start tier: low with 2 or fewer cores, medium on mobile, touch or 4 or fewer cores, otherwise high. After a 2 s warm-up, 120 consecutive frames over 22 ms step one tier down (high, medium, low); tiers never step back up.
