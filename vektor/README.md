# Vektor

Progressively enhanced Rally-style arcade games in plain HTML, CSS, and JavaScript. No build step.

- **Hub** — `/` (`index.html`) — links to V1, V2, V4; V3 Breach placeholder
- **V1** — baseline Rally — `/v1/` — difficulty (CADET / PILOT / ACE), idle title screen, mobile control bar
- **V2** — match play (best of 5 games, first to 7 per game), seven color themes, Web Audio sounds — `/v2/` — same difficulty + idle flow as V1
- **V4** — Debris — `/v4/` — 800×600 canvas, schemes, hunters, high score (`localStorage`), mobile/desktop controls per spec

Deploy on Vercel with framework **Other**, no build command, output directory **root**.

Palette and structure follow the project brief; audio is synthesized with the Web Audio API (no audio files).
