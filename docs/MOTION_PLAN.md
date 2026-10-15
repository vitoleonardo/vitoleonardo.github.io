# Motion plan, "The Path" v3 (15.10.2026)

Source: the-path-motion.mp4 plus the motion spec. The video plays time, the site plays scroll. The video shows one fixed stage where text crossfades and the path morphs in place, so desktop becomes one pinned stage of 11 scenes (no sideways slide, no camera move). Units below: vh = one viewport of scroll, s = video seconds. Each scene is a GSAP sub-timeline written in video seconds and stretched to its scroll length.

## Desktop stage (>= 900 px, motion allowed, WebGL)
One ScrollTrigger pins `main` for 13 vh, `scrub 0.65`, Lenis lerp 0.09 on gsap.ticker. Sections are layered (`html.stage-mode`), inactive scenes get opacity 0 and no pointer events but stay focusable; focus scrolls to their scene.
Path state is a pure function `scoreFrame(scene, seconds)` read from the master time every tick, so reverse scroll replays every beat backwards exactly.

| Beat | Scroll range | Trigger | Parameters |
|---|---|---|---|
| Hero load 0 to 1.6 s | on load, time based | gsap timeline at boot | grid scaleY 0.9 s power3.out; nav fade 0.1 to 0.6; pill y16 fade 0.3 to 0.8; name chars yPercent 110, 0.6 s, stagger 0.03, power4.out from 0.35, masked; lead y14 fade 0.9 to 1.4; sun scale back.out(1.7) 0.25 to 0.95 |
| Sun drop 1.6 to 3.2 s | 0 to 1.6 vh (scene 0) | master pin, label `hero` | fall y 190 to 500, q squared over 0.75 s; squash x 1.35, y 0.30, sink 30 to 58 px, melt 0.35 s; line grows both ways from (1040, 560), 0.3 s power4.out |
| Index 3.0 to 4.8 s | 1.6 to 3.1 vh (scene 1) | label `index` | hero copy y -36 and fade 0 to 0.4 s, grid fades; heading y 20 fade 0.35 to 0.85 s; then morph line y 560 to y 308 (the DOM markers) 0.5 to 0.8 s; markers back.out(1.7) stagger 0.07 s from 0.75 s, marker 06 red; rest 1.6 s |
| Stops 1 to 7, 0.88 s each | 3.1 to 10.1 vh, 1 vh each (scenes 2 to 8) | labels `stop-1` to `stop-7` | morph 0 to 62 %, wave pi = clamp(p*1.5 - 0.5 i/519), cosine ease, extra smoothing weight 4p(1-p) radius 12, 3 passes; ground blend 0 to 30 % (teaching 40 %); caption, title, tools fade and rise 18 px 18 to 42 %; figure labels 32 to 55 %; text out 90 to 100 %; progress bar one segment per stop |
| Data braid | stop 4 | same | S-curve (-80,470) to (1360,400), radius taper 0.22 to 1 between x 560 and 900; 4 strands r 5.5, offset amount*((k-1.5)*40*env + 11 sin(x/55 + 1.7k - 3t)*fade), amount = entry progress |
| Red ink | stop 6 in, stop 7 out | same | uniform red range along normalised arc, 40 px soft edge; red front 0 to 1 over 0 to 42 % of stop 6; blue front 0 to 1 over 0 to 45 % of stop 7; rocket parts fade and lift 30 px 38 to 68 %, leave 0 to 18 % of stop 7 |
| Teaching lights | stop 7 | same | 20 DOM lights switch on one by one over 0.45 s of the stop (24 to 74 %), soft glow, unlit as outlines; blue-hour glow (night 0.35) 22 to 62 %, after the rocket has left |
| Night 11.0 to 12.6 s | 10.1 to 11.6 vh (scene 9) | label `about` | ground #2A3260 to #070914 in 0.8 s; morph 0.3 s to y = 540 + 42 sin((x-200)/170); night 0 to 1 over 0.8 s: emissive and bloom, ripple A = 2.2 + 5 beat (62 bpm), glow 30 + 28 pulse (124 bpm, cos^3); beams fade in, sway on the clock; heading in 0.25 to 0.75 s, out 1.5 to 1.6 s |
| Loop closes 12.6 to 15 s | 11.6 to 13.1 vh (scene 10) | label `say-hi` | ground to #05060D; morph 0.5 s to stem (640, -80 to 110) plus circle (640, 360) r 250; ripple and pulse fade to 0 over 0 to 0.5 s and stay off; say hi block 0.7 to 1.3 s; bottom bar 1.1 to 1.6 s |

Clock-driven, never on scroll: ripple (vertex shader, arc length, offset = A sin(k s - 2.6 t)), braid travel, beat, pulse, beams.

## Snap
Rest points: hero start, hero grown, index hold, the 7 stop holds (76 % of each stop), about hold, say hi end. Snap acts only from the index hold to the last stop: when Lenis rests outside a hold zone there, it glides (0.5 to 0.95 s, sine.inOut, so the morph is not squeezed into a fast middle) to the next rest point in the direction of the last scroll, never back against it, so a slow wheel can not be trapped. The hero, about and say hi are never snapped, so the sun drop and the night stay scrubbable. Keys and nav links jump to all rest points.

## Engine (src/three)
Figures: control points in 1280 x 720, Chaikin 5 iterations (25 / 75 %), resampled to 520 equal steps, shifted +80 into the 1280 x 880 stage boxes. Tube: 520 rings x 20 sides, radius 17 (11 on mobile), per-ring radius for the taper, attributes for arc length and in-plane normal so ripple and ink run in the shader; geometry is rebuilt only when scroll changes the frame. MeshPhysicalMaterial roughness 0.25, clearcoat 1 / 0.1, RoomEnvironment pre-blurred (PMREM sigma 0.18) so the specular stays soft; contact shadow 16 px down, soft, light grounds only; UnrealBloom only at night (strength 1.35, tight mip weights, pre-warmed at load, no MSAA at DPR 2).

## Mobile (< 900 px) and fallbacks
Same engine and score with MOBILE_TIMING (the values before the tempo map, since stages scroll in instead of crossfading); each figure maps into its own section stage, morphs run while the next stage scrolls in, radius 11, no bloom. Reduced motion and no WebGL keep static SVG figures, regenerated from the same control points by scripts/gen-fallbacks.mjs.

## Tempo map (measured and applied 15.10.2026)
Reference speed 0.978 vh/s: 13.1 vh over the 13.4 scroll-driven video seconds (1.6 to 15 s), so 880 px/s at 900 px tall. Scrub lag 94 ms (expo restart over 0.65 s), Lenis lag 185 ms. Video measured with scripts/motion-timing (optical flow on all 450 frames); site curves modelled from DESKTOP_TIMING in score.ts. Duration = onset to settle at 10 % of peak speed; deltas in 30 fps frames. Curves: docs/motion-tempo.png, docs/motion/video-timeline.png.

| Scene | score s / vh | rate at reference | decision |
|---|---|---|---|
| hero, index | 1.9 / 1.6, 1.8 / 1.5 | 1.16, 1.17 | keep length; the beats inside were off, not the scene |
| stops | 0.88 / 1 each | 0.86 steady, 0.93 by snap glide | keep; snap sets the tempo here, spacing matches the video (0.89 s) |
| about | 1.6 / 1.5 | 1.04 | keep |
| say hi | 2.4 / 1.5 | 1.56 | keep (decided): the final hold absorbs it |

| Beat | video | before | now, steady scroll | now, snap glide |
|---|---|---|---|---|
| sun fall | 0.40 s, glides and lands soft | 0.73 (+10) | unchanged: gravity q² decided over the video | |
| line grows | 0.23 s | 0.57 (+10) | 0.34 (+3) | |
| index morph | 0.20 s, after the heading | 0.68 (+14), during it | 0.36 (+5), after it | |
| stop morph | 0.50 s (0.37 to 0.57) | 0.60 (+3), snap 0.35 (-5) | 0.60 (+3) | 0.44 (-2) |
| stop ground | 0.27 s | 0.65 (+12) | 0.45 (+5) | 0.36 (+3) |
| red ink in / out | 0.37 / 0.40 s | 0.75 / 0.85 (+11 / +13) | 0.54 / 0.56 (+5) | 0.40 / 0.42 (+1) |
| teaching ground | 0.37 s | 0.65 (+9) | 0.53 (+5) | 0.40 (+1) |
| night morph | 0.23 s | 0.80 (+17) | 0.38 (+4) | |
| say hi morph | 0.33 s | 0.56 (+7) | 0.40 (+2) | |

Already matching: stop spacing, text out and in around each stop (within about 3 frames), marker stagger 0.07 s. Floor: with scrub 0.65 and wave spread 0.5 no morph gets below about 0.33 s. Snap glide recorded in Chrome: 0.885 s over 680 px, fits sine.inOut (RMSE 0.015, power2.inOut 0.067).

## Verification
npm run build; Playwright recording at a steady wheel speed (scripts/record-motion.mjs); docs/motion-compare.png with sun impact, data stop and rocket next to the video frames; frame time measured in the sideways section. Timing: `python scripts/motion-timing/video_timing.py <video> docs/motion/video-timing.json`, then `tempo_report.py` (requirements.txt beside it).
