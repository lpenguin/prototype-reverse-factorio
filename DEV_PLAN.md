# Factorio-Like Game — Development Plan

## Tech Stack
- **TypeScript** (no framework)
- **Vite** — build & dev server
- **Vitest** — unit tests
- **SVG** — all world rendering inside `<svg>` → `<g id="world" transform="translate(panX panY) scale(zoom)">`
- HUD and toolbar as regular DOM `<div>` overlays

---

## Core Data Model (`src/types.ts`)

| Type | Shape |
|---|---|
| `Direction` | enum: N, NE, E, SE, S, SW, W, NW (8 values) |
| `ItemDefinition` | `{ id, name, properties: Record<string,string\|number>, cost, icon: string (SVG path data) }` |
| `ItemInstance` | `{ defId, x, y }` — item sitting on a tile |
| `Emitter` | `Building + { itemPool: string[], portDirection: Direction }` |
| `Belt` | `Building + { direction: Direction }` |
| `Receiver` | `Building + { portDirection: Direction }` |
| `WorldState` | `{ buildings: Map<"x,y", Building>, items: Map<"x,y", ItemInstance>, playerMoney, tick }` |

Port cell rule: `portCell = (building.x + dx(dir), building.y + dy(dir))`

---

## Project Structure
```
src/
  main.ts            — bootstrap, tick loop (setInterval 500ms)
  types.ts           — all interfaces/enums
  world.ts           — WorldState factory + placeBuilding/removeBuilding/getItem helpers
  simulation.ts      — tick(world): receivers consume → belts move → emitters spawn
  renderer.ts        — updateSVG(world, viewport) — grid lines + buildings + items
  input.ts           — pan/zoom (wheel + drag), click-to-place, Ctrl+click belt rotate
  buildings/
    emitter.ts       — createEmitter(), emitterTick()
    belt.ts          — createBelt(), rotateBelt() (last direction remembered)
    receiver.ts      — createReceiver(), receiverTick()
  items/registry.ts  — 3–5 predefined ItemDefinitions
  ui/
    toolbar.ts       — bottom palette (Emitter | Belt | Receiver), tracks selected type
    hud.ts           — money counter DOM overlay
index.html
vite.config.ts / vitest.config.ts / tsconfig.json
```

---

## Rendering Architecture
- `<svg id="app">` fills 100vw × 100vh
- `<g id="world">` holds grid lines, buildings, item icons — transform updated on pan/zoom
- Grid lines: only compute visible tile range from current pan/zoom + viewport dimensions
- Pan: pointerdown+move on SVG → update panX/panY
- Zoom: wheel event → adjust zoom + panX/panY to keep cursor fixed

---

## Simulation Tick Order (2/sec, 500ms)
1. **Receivers** — if item at port cell → `playerMoney += item.cost`, remove item
2. **Belts** — if item at belt cell AND target cell empty → move item to target
3. **Emitters** — if port cell empty → place random item from pool there

---

## Development Phases

### Phase 1 — Project Setup + Data Model + SVG Shell
1. Scaffold Vite TS project, add Vitest config
2. Define all types in `src/types.ts`
3. Implement `src/world.ts` with WorldState + mutation helpers
4. Build SVG shell: full-viewport SVG + `<g id="world">`, pan & zoom working, grid lines rendered
5. Tests: direction offset math, world mutation helpers

### Phase 2 — Buildings + Placement + Rendering *(depends on Phase 1)*
1. Building constructors in `src/buildings/`
2. Toolbar palette UI with selected-state tracking
3. Click-to-place: SVG mouse pos → tile coords → `placeBuilding()`
4. Ctrl+click belt → `rotateBelt()` CW (stores last used direction for new belts)
5. Render each building type distinctly (rect + directional arrow)
6. Tests: rotation cycle, tile coord conversion, collision on placement

### Phase 3 — Simulation + Items + HUD *(depends on Phase 2)*
1. Item registry with 3–5 sample items
2. `src/simulation.ts` — full tick logic
3. Tick loop wired in `main.ts`
4. Render item instances as small icons on tiles
5. HUD money counter updating post-tick
6. Tests: end-to-end tick scenarios (spawn → move × N → consume → money check)

### Phase 4 — Polish *(parallel-able after Phase 3)*
- SVG path icons for items
- Belt direction arrows (rotated sprite per direction)
- Ghost preview tile while hovering before placing
- Right-click to delete a building
- Hover tooltips (building info, item name/cost)

---

## Key Decisions
- Grid: infinite, 48px tiles, pan+zoom via SVG `<g>` transform
- Tick rate: 2/sec (500ms `setInterval`)
- New belts default to last-placed direction
- Phase 1 = data model + rendering shell only (no simulation)
- Items stored in flat `Map<"x,y", ItemInstance>` in WorldState (not embedded in building objects)
