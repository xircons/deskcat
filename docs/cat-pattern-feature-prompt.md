# Prompt: add spotted cat patterns to DeskCat (port from Catjang)

Paste everything below into Claude Code, running with both repos accessible:
`~/Documents/GitHub/deskcat` (target) and `~/Documents/GitHub/catjang-sue` (reference).

---

Act as a senior Electron + TypeScript engineer. I want to add real cat coat
**patterns** (calico, tabby, siamese, cheese, plus the existing solid colors)
to DeskCat, using Catjang as the reference implementation. Follow the rules in
`.claude/claude.md` (no comments in code, no emojis).

## Reference (read-only): how Catjang does it

In `~/Documents/GitHub/catjang-sue`:

- `presets/patterns/*.json` — each preset stores `baseColor`, `eyeColor`,
  `eyeBgColor`, `oddEye`, and per-part spot arrays: `head`, `body`, `tail`,
  `earL`, `earR`, each an array of `{ x, y, color }` grid cells. Solid coats
  (black, white, russian-blue) have empty spot arrays and only set colors.
- `renderer/cell-mappings.js` (~71k lines) — `window.cellMappings.MAPPINGS`,
  keyed `"<svgName>:<part>"` (e.g. `"cat-idle-follow-v2:head"`). Each entry has
  `cellsX`, `cellsY`, `origin`, `svgW`, `svgH`, and a `cells` map
  `"cellX,cellY": [[dx,dy], ...]` giving the SVG pixels each editor grid cell
  paints.
- `renderer/renderer.js` — `applyPatternToSvg`, `applyPatternSpotsToElement`,
  `getMappedPixelsForSpot`, `distributeBodyPatchesToChain` read those mappings
  and inject colored `<rect>`s into each pose SVG's `.patches` slots (the body
  spots are distributed across the 16 stretch-chain segments).
- `editor/editor.js` — the pixel editor that produces the preset JSON.

## The core challenge (do not skip)

DeskCat's sprites are NOT Catjang's. In `deskcat/assets/cat/` the poses
(`idle.svg`, `press-left.svg`, `press-right.svg`, `stretch-*.svg`) have:
- namespaced element ids (`idle-head`, `pl-head`, `pr-ear-left`, ...),
- ears and tails baked in (not injected at runtime),
- different viewBoxes and pixel coordinates.

So Catjang's `cell-mappings.js` coordinates will NOT line up. You must either
regenerate a cell→pixel mapping for DeskCat's actual sprite geometry, or design
a simpler mapping that fits DeskCat. Confirm the approach before writing it.

## What to build in DeskCat

1. A `patterns/` set of preset JSONs adapted to DeskCat (start with: black,
   grey, white, calico, cheese, mackerel-tabby, siamese). Keep the existing
   `config.theme` solid-color themes working; patterns extend that system.
2. Extend `src/main/config.ts`: add a validated `pattern` field (id string),
   sanitized against the known preset ids, default `"classic"`. Mirror it in
   the renderer `AppConfig` interface.
3. In `src/renderer/renderer.ts`, load the selected preset and paint its spots
   onto every pose that is visible (idle + press-left + press-right at minimum;
   stretch poses if feasible), reusing the existing `.patches` groups and the
   `--cat-color` / `--eye-color` variables. The typing-heat red tint and the
   grumpy/lonely expressions must still work on top of the pattern.
4. Add a "Cat pattern" picker to the Settings panel (next to the existing
   "Cat color" selector), save to config, live-preview on change.

## Constraints & acceptance

- Non-commercial only; keep the Catjang attribution in `CREDITS.md` and add the
  pattern-engine credit there too (CC BY-NC 4.0).
- No comments in code, no emojis (per `.claude/claude.md`).
- `npm run build` (tsc) must pass with no errors.
- Verify visually by running `npm start`, opening Settings, and switching
  patterns while idle, while typing, and during a reminder (grumpy) — take
  screenshots and confirm no misaligned or floating spots and no stray eye-white.

Start by reading the Catjang reference files above and the DeskCat sprite files,
then propose your mapping approach and a short plan before implementing.
