# Codebase Overview: prototype-reverse-factorio

## 1. Project Purpose

**What it is:** A browser-based, grid-based factory simulation game inspired by Factorio, but with an inverted (reverse) twist.

**Core game loop:**
- The map is pre-seeded with **garbage tiles** (static resource deposits).
- Players place **Emitters** on garbage tiles to extract items from them.
- Players lay down **Belts** to transport items across the grid.
- Players place **Sorters** to filter items by properties onto different output paths.
- Players place **Receivers** to consume items for money. Each Receiver has an assigned **Request** specifying what item properties are desired (and at what reward/penalty).
- The player earns money by satisfying requests, and loses money for delivering wrong items.

**The "Reverse" concept:** Rather than *building* a factory that *produces* resources (as in normal Factorio), the player *manages and routes* pre-existing garbage/resources *toward* consumers (receivers) that have specific requirements. The emphasis is on sorting and routing logistics.

---

## 2. Technology Stack

| Technology | Version | Role |
|---|---|---|
| **TypeScript** | ~5.9.3 | Primary language |
| **Vite** | ^7.3.1 | Dev server + production bundler |
| **Vitest** | ^4.0.18 | Unit test runner |
| **ESLint** | ^10.0.3 | Linter |
| **typescript-eslint** | ^8.56.1 | TypeScript-aware ESLint rules |
| **SVG (DOM API)** | — | All in-game world rendering |
| **HTML/CSS** | — | HUD overlays, toolbar, dialogs |

**No runtime frameworks** — pure TypeScript with direct DOM manipulation. No React, Vue, or any UI library. Module format is ESM (`"type": "module"` in package.json).

---

## 3. Directory Structure

```
/workspaces/prototype-reverse-factorio/
├── index.html                  # Single-page app entry. Contains inline CSS + SVG shell.
├── package.json                # Project metadata, scripts, devDependencies
├── tsconfig.json               # TypeScript compiler config
├── eslint.config.js            # ESLint config (flat config format)
├── DEV_PLAN.md                 # Developer planning document with phased roadmap
├── README.md                   # Minimal project readme
├── documentation.ai.md         # This file — AI-friendly codebase overview
├── public/
│   ├── vite.svg                # Vite logo (unused by game)
│   └── icons/                  # SVG icon assets for buildings
│       ├── belt.svg
│       ├── emitter.svg
│       ├── erase.svg
│       ├── orb.svg
│       ├── receiver.svg
│       └── sorter.svg
├── dist/                       # Production build output (gitignored, built by vite build)
│   ├── assets/                 # Bundled JS/CSS chunks
│   ├── icons/                  # Copied icon SVGs
│   └── index.html
└── src/
    ├── main.ts                 # App bootstrap, toolbar init; subscribes to GameTimer
    ├── timer.ts                # GameTimer: drives tick + render loops, pauses on window hide
    ├── types.ts                # All shared TypeScript interfaces/enums/types
    ├── world.ts                # WorldState factory and CRUD helpers
    ├── simulation.ts           # 3-phase tick algorithm (the core simulation engine)
    ├── renderer.ts             # SVG rendering: grid, buildings, items, HUD, dialogs
    ├── input.ts                # Mouse/keyboard input: pan, zoom, place, erase, rotate
    ├── registry.ts             # Singleton registries that load from JSON config files
    ├── counter.ts              # Leftover Vite scaffold stub (unused by game)
    ├── style.css               # Leftover Vite scaffold CSS (unused by game; styles in index.html)
    ├── typescript.svg          # Leftover Vite scaffold asset (unused by game)
    ├── buildings.config.json   # Building definitions (id, name, type, icon, ports)
    ├── items.config.json       # Item definitions (id, name, properties, iconPath)
    ├── map.config.json         # Map generation settings (garbage region, density, pool)
    ├── properties.config.json  # Item property schemas (color, shape, size with values)
    ├── requests.config.json    # Request definitions (requirements, reward, penalty)
    ├── world.test.ts           # Tests for world.ts utilities
    ├── simulation.test.ts      # Tests for the simulation tick engine
    └── requests.test.ts        # Tests for request/scoring logic
```

---

## 4. Key Files

| File | Role |
|---|---|
| `src/main.ts` | **Entry point.** Creates `WorldState` and `ViewState`, initializes the toolbar UI from registry, creates a `GameTimer` and registers `onTick` (simulation step) and `onFrame` (lerp + render) subscribers. Also manages the `dyingItems` map for despawn animations. |
| `src/timer.ts` | **Game scheduler.** `GameTimer` class that owns the `setInterval` tick and `requestAnimationFrame` render loop. Listens to `document.visibilitychange` — suspends both loops when the window is hidden and resumes them (resetting `lastFrameTime`) when visible again, preventing stale-delta animation glitches. Exposes `onTick(cb)`, `onFrame(cb)`, `start()`, `stop()`. |
| `src/types.ts` | **Type definitions hub.** Contains every shared TypeScript interface, enum, and type used across all modules. Single source of truth for the data model. |
| `src/world.ts` | **World state module.** Factory (`createWorld`), map generation (`generateGarbage`), and CRUD helpers (`placeBuilding`, `removeBuilding`, `addItem`, `removeItem`, `getPortCell`, `gridKey`, `getDirectionOffset`). |
| `src/simulation.ts` | **Simulation engine.** Implements the 3-phase tick algorithm: Intent Generation → Iterative Resolution → Execution. Exports `tickWorld(world)`. Also contains legacy `moveItem`, `getHandler`, `evaluateRoundRobinSources` for backward compat. |
| `src/renderer.ts` | **SVG renderer.** Renders grid lines, static garbage objects, buildings (with icons, rotation, and sorter overlays), items (as SVG shapes derived from properties), the building placement ghost/preview, HUD text, and the request hover popup. Also exports `openSorterDialog`. |
| `src/input.ts` | **Input handler.** Sets up pointer events for pan (drag), zoom (wheel), place (left-click/shift-drag), erase (erase tool click/shift-drag), building rotation (right-click on placed building or wheel when tool selected), and Escape to cancel selection. Also handles mousemove for ghost preview and request popup. |
| `src/registry.ts` | **Singleton data registries.** Loads all five JSON config files at module initialization. Exports `buildingsRegistry`, `itemRegistry`, `mapRegistry`, `requestRegistry`, `propertyRegistry`. |
| `index.html` | **HTML shell.** Defines the full-viewport `<svg id="app">` with `<g id="grid">` and `<g id="world">` layers, plus DOM overlays: `#hud`, `#request-popup`, `#toolbar`, `#pause-btn`. All inline CSS for the UI is here. |
| `buildings.config.json` | Declares the 4 building types with ids, names, types, icon paths, preferred placement constraints, and port definitions. |
| `items.config.json` | Declares the 3 item types with their property sets (size, shape, color). |
| `requests.config.json` | Declares the 3 request types with property conditions (multi-value), reward cost, and penalty. |
| `properties.config.json` | Declares the 3 property schemas (color, shape, size) with named values mapping to render primitives (hex colors, shape strings, pixel sizes). |
| `map.config.json` | Declares map generation parameters: the rectangle for garbage scatter, density, blob min/max size, and item pool. |

---

## 5. Core Modules / Components

### `world.ts` — World State Management

The **authoritative state container** and its helper functions.

- `createWorld()` → `WorldState`: Initializes all maps empty, sets money/tick to 0, calls `generateGarbage()` to populate `staticObjects`.
- `generateGarbage(world)`: Uses blob-growth BFS to randomly scatter garbage piles within the configured `garbageRect`. Each blob is 1–N tiles, grown from a random seed using a shuffled-neighbors queue.
- `gridKey(x, y)`: `Math.floor` both coords and return `"x,y"` string — the universal Map key format.
- `getDirectionOffset(dir)`: Maps `Direction` enum value to `{dx, dy}`.
- `placeBuilding(world, building)`: Checks for collision, checks `preferredStaticTypes` constraint (e.g., Emitters must be on garbage tiles), assigns `requestId` to Receivers via round-robin from `requestRegistry`, then inserts into `world.buildings`.
- `removeBuilding(world, x, y)`: Deletes from `world.buildings`.
- `addItem(world, item)`: Checks for collision, initializes `renderX/Y/Scale` if missing, inserts into `world.items`.
- `removeItem(world, x, y)`: Removes and returns the item.
- `getPortCell(building, dir)`: Computes the adjacent cell in direction `dir` from building's `x,y`.

### `simulation.ts` — The Tick Engine

The **3-phase simulation algorithm** runs once per 500ms tick:

**Phase 1 — Intent Generation (`generateIntents`):**
Every item (and every emitter) produces a `Ticket` declaring its movement intent:
- **Emitter ticket** (virtual, `item: null`): If the emitter sits on a garbage tile with items, it declares intent to push an item to its forward cell.
- **Belt ticket**: The item at the belt declares intent to move to the belt's forward cell.
- **Sorter ticket**: The item sitting on the sorter cell declares intent to move to the sorter's output cell.
- **Sorter-pull injection (Pass 2)**: For each sorter, if its input cell has an item:
  - If it matches the filter AND there's a belt ticket from that cell: inject the sorter cell as the *primary* intent (or add it as the overflow belt if belt already points at sorter).
  - If it matches AND there's no belt: create a `pull:` ticket to pull the item in.
  - If it doesn't match AND the belt points into the sorter: redirect the belt past the sorter.

**Phase 2 — Iterative Resolution (`resolveIntents`):**
- Proposals are grouped by target cell. Single proposers proceed; conflicts use **Round-Robin arbitration** (clockwise priority from `lastInputIndex`).
- A loser tries its next intent (overflow). If no intents remain, it's BLOCKED.
- A winner checks `checkCanMove()`: can the target cell's occupant (if any) move out? Uses DFS with EVALUATING cycle detection (cycles are allowed to move).
- The loop repeats until all tickets are resolved (LOCKED_MOVING or BLOCKED).

**Phase 3 — Execution / Double-Buffer (`executeTickets`):**
- Builds `nextItems` from scratch.
- BLOCKED real items copy to their source key in `nextItems`.
- LOCKED_MOVING real items: if target is a Receiver → call `scoreReceiver`; otherwise update `item.x/y` and set in `nextItems` at target key.
- LOCKED_MOVING virtual emitter items: spawn a new `ItemInstance` at the target (or score receiver if adjacent).
- Updates `lastInputIndex` on the target building for round-robin state.
- Swaps `world.items = nextItems`.

**Scoring (`scoreReceiver`):** Looks up the receiver's `requestId`, checks if every property condition in the request is satisfied by the item's definition properties. If yes: `playerMoney += cost`. If no: `playerMoney -= penalty`.

**Legacy exports:** `moveItem`, `getHandler`, `evaluateRoundRobinSources`, `sorterHandler` — kept for test backward compatibility.

### `renderer.ts` — SVG Renderer

Renders the world to SVG DOM elements every animation frame. Stateless: given `WorldState` + `ViewState`, it rebuilds SVG layer contents:

- **`renderGridLines(svgGrid, view, width, height)`**: Clears and redraws visible grid lines only within the current viewport (computed from panX/Y + zoom + viewport size). Lines are `<line>` elements with `stroke="#ccc"`.
- **`updateTransform(worldGroup, view)`**: Sets `transform="translate(panX,panY) scale(zoom)"` on the `#world` `<g>` element.
- **`renderWorld(world, worldGroup, view, dyingItems)`**: Manages three SVG sub-layers:
  - `#static-layer`: Renders garbage tiles as gray rectangles with deterministic pseudo-random line decorations (seeded from x,y coordinates using bit math).
  - `#buildings-layer`: Renders each building as an `<image>` element pointing to its SVG icon, rotated `(direction - 1) * 90` degrees. Sorters additionally render orange (input) and green (output) port triangles plus a filter label text node.
  - `#items-layer`: Renders items as SVG primitive shapes derived from their `properties`: `circle` → `<circle>`, `triangle` → `<polygon>`, everything else → `<rect>`. Size and color come from `propertyRegistry.getValue(...)`. Uses `item.renderX/Y/Scale` (lerped values) for smooth animation. Also renders `dyingItems` (items fading out post-consumption).
  - Calls `renderPreview()` to draw the placement ghost.
- **`renderPreview(worldGroup, view, world)`**: Shows a semi-transparent ghost rect+icon at `previewCoords`. Green if placement is valid, red if occupied or invalid (e.g., emitter not on garbage). Red cross-hair style if erase tool is selected.
- **`updateHUD(world)`**: Updates `#hud` text content with current money and tick.
- **`openSorterDialog(sorter, onClose)`**: Creates and appends a floating `#sorter-dialog` DOM div with `<select>` dropdowns for property and value. Mutates the sorter object's `filterProperty`/`filterValue` directly on change.
- **`updateRequestPopup(world, gridX, gridY, screenX, screenY)`**: Shows/hides `#request-popup` based on whether the hovered cell contains a receiver with a request. Displays request name, property conditions (with color swatches), reward and penalty.

### `input.ts` — Input Handler

Sets up all user interaction on the SVG element:

- **Pan**: `pointerdown` (no tool selected, no building clicked) → drag → update `viewState.panX/Y`.
- **Zoom**: `wheel` event → clamp zoom 0.2–5.0 → zoom centered on cursor using pan compensation math.
- **Direction cycling**: `wheel` when tool selected → cycle `selectedDirection` (clockwise or CCW based on `deltaY`).
- **Place**: Left-click → `tryPlace()` → `placeBuilding(world, newBuilding)`. Shift+drag for continuous painting.
- **Erase**: Erase tool left-click/drag → `tryErase()` → `world.buildings.delete(key)`.
- **Rotate placed building**: Right-click on existing building → increment `building.direction` by 1 (CW), sync `viewState.selectedDirection`.
- **Cancel selection**: Right-click empty tile or Escape key → clear `selectedBuildingId`, remove `.selected` class from toolbar items.
- **Sorter dialog**: Left-click on a sorter (with no tool selected) → `openSorterDialog(clickedBuilding)`.
- **Preview**: `pointermove` updates `viewState.previewCoords` for the ghost preview.
- **Request popup**: `pointermove` calls `updateRequestPopup()` to show/hide the hover tooltip.

### `registry.ts` — Configuration Registries

Module-level singletons loaded from JSON at import time. All registries are instantiated once and exported as constants.

- **`BuildingsRegistry`**: `Map<string, BuildingDefinition>`. Methods: `getBuilding(id)`, `getAllBuildings()`.
- **`ItemRegistry`**: `Map<string, ItemDefinition>`. Methods: `getItem(id)`, `getAllItems()`.
- **`MapRegistry`**: Flat object. Properties: `garbageRect`, `density`, `minSize`, `maxSize`, `itemPool`.
- **`RequestRegistry`**: Array + Map. Methods: `getNextRequest()` (round-robin index), `getRequest(id)`, `getAllRequests()`.
- **`PropertyRegistry`**: `Map<string, PropertyDefinition>`. Methods: `getProperty(id)`, `getValue(propertyId, valueName)`, `getAllProperties()`.

---

## 6. Data Flow

```
INITIALIZATION:
  registry.ts loads JSON configs
  → createWorld() creates empty WorldState + generates garbage staticObjects
  → setupInput() attaches event listeners
  → toolbar DOM built from buildingsRegistry.getAllBuildings()

SIMULATION TICK (every 500ms):
  setInterval → [if !world.isPaused] →
    snapshot current world.items (to detect removed items for dying animation)
    → tickWorld(world):
        generateIntents(world) → Ticket[]
        resolveIntents(tickets, world) → mutates ticket.state (LOCKED_MOVING / BLOCKED)
        executeTickets(tickets, world):
          → scoreReceiver() → world.playerMoney +=/-= amount
          → world.items = nextItems (double-buffer swap)
          → world.tick++
    updateHUD(world) → mutates #hud DOM
    → populate dyingItems with any items that left world.items

RENDER LOOP (every animation frame ~60fps):
  requestAnimationFrame → renderLoop():
    lerp world.items[*].renderX/Y/Scale toward .x/.y/1.0
    lerp dyingItems[*].renderX/Y toward .x/.y, then scale toward 0; remove when tiny
    → renderWorld(world, worldGroup, viewState, dyingItems):
        clear + redraw #static-layer (garbage tiles)
        clear + redraw #buildings-layer (building icons, sorter overlays)
        clear + redraw #items-layer (item shapes at renderX/Y)
        renderPreview (ghost tile at previewCoords)

USER INPUT:
  pointer/wheel/key events → mutate viewState (panX/Y, zoom, selectedBuildingId,
    selectedDirection, previewCoords) or world (place/remove buildings)
  → on significant changes: updateTransform(), renderGridLines(), renderWorld()
  → on pointermove over receiver: updateRequestPopup()
  → on left-click sorter (no tool): openSorterDialog()
```

---

## 7. Key Abstractions and Types

### `types.ts` — Complete Type Reference

```typescript
// 4-way direction enum (const object pattern)
Direction = { N: 0, E: 1, S: 2, W: 3 }
type Direction = 0 | 1 | 2 | 3

// Per-ticket simulation state (not stored on items, used only within tickWorld)
MoveState = { UNRESOLVED, EVALUATING, LOCKED_MOVING, BLOCKED }

// Configuration types (loaded from JSON)
ItemDefinition  = { id, name, properties: Record<string, string|number>, iconPath }
PropertyDefinition = { id, name, values: Record<string, string|number> }
RequestDefinition  = { id, name, properties: Record<string, string[]>, cost, penalty }
MapDefinition   = { garbageRect: {x1,y1,x2,y2}, density, minSize?, maxSize?, itemPool? }

// Config file wrapper types
PropertiesConfig = { properties: PropertyDefinition[] }
BuildingsConfig  = { buildings: BuildingDefinition[] }
ItemsConfig      = { items: ItemDefinition[] }
RequestsConfig   = { requests: RequestDefinition[] }

// Runtime instance type
ItemInstance = {
  defId: string;      // links to ItemDefinition.id
  x: number;          // logical grid position
  y: number;
  renderX: number;    // interpolated position (lerped toward x each frame)
  renderY: number;
  renderScale: number; // interpolated scale (0=spawning/dying, 1=normal)
}

// Building type discriminant
BuildingType = 'emitter' | 'belt' | 'receiver' | 'sorter'

// Building definition (from JSON config, not placed instance)
BuildingDefinition = {
  id: string;
  name: string;
  type: BuildingType;
  size: { x: number; y: number };
  iconPath: string;                      // URL to /public/icons/*.svg
  preferredStaticTypes?: string[];       // e.g. ['garbage'] for emitter
  itemPool?: string[];
  ports?: Array<{ type: 'input'|'output', x, y, direction: string }>
}

// Placed building instances (union type)
BaseBuilding = { type, x, y, direction: Direction }
Emitter  extends BaseBuilding { type: 'emitter' }
Belt     extends BaseBuilding { type: 'belt'; lastInputIndex?: Direction }
Receiver extends BaseBuilding { type: 'receiver'; requestId?: string; lastInputIndex?: Direction }
Sorter   extends BaseBuilding { type: 'sorter'; filterProperty?: string; filterValue?: string; lastInputIndex?: Direction }
Building = Emitter | Belt | Receiver | Sorter

// Non-building static map tile
StaticObject = { type: 'garbage'; x: number; y: number; itemPool: string[] }

// Full game world state
WorldState = {
  buildings:     Map<string, Building>      // key: "x,y"
  items:         Map<string, ItemInstance>  // key: "x,y"
  staticObjects: Map<string, StaticObject>  // key: "x,y"
  playerMoney:   number
  tick:          number
  isPaused:      boolean
}

// View / rendering state
ViewState = {
  panX:               number    // SVG world-group X translation offset
  panY:               number    // SVG world-group Y translation offset
  zoom:               number    // SVG world-group scale factor (0.2–5.0)
  cellSize:           number    // pixels per grid cell (48)
  selectedBuildingId: string | null   // currently selected toolbar tool id, or 'erase'
  selectedDirection:  Direction       // direction for next placed building
  previewCoords:      { x: number; y: number } | null  // grid cell under cursor
}
```

### Internal simulation type (in `simulation.ts`):
```typescript
interface Ticket {
  id: string;           // "x,y" for real items, "emitter:x,y" for virtuals, "pull:x,y" for sorter pulls
  item: ItemInstance | null;  // null for virtual emitter tickets
  sourceKey: string;    // current grid key of the item
  emitterKey?: string;  // for virtual emitter tickets
  intents: string[];    // ordered list of candidate target keys
  intentIndex: number;  // current intent being tried
  state: MoveState;
}
```

---

## 8. Inter-Module Dependencies

```
main.ts
  ├── imports createWorld ← world.ts
  ├── imports ViewState, ItemInstance ← types.ts
  ├── imports setupInput ← input.ts
  ├── imports buildingsRegistry ← registry.ts
  ├── imports updateHUD, renderWorld ← renderer.ts
  └── imports tickWorld ← simulation.ts

input.ts
  ├── imports ViewState, WorldState, Direction, Building, ItemInstance, Sorter ← types.ts
  ├── imports renderGridLines, updateTransform, renderWorld, updateRequestPopup, openSorterDialog ← renderer.ts
  ├── imports placeBuilding, gridKey, removeItem ← world.ts
  ├── imports buildingsRegistry ← registry.ts
  └── imports getHandler ← simulation.ts

renderer.ts
  ├── imports ViewState, WorldState, ItemInstance, Receiver, Sorter ← types.ts
  ├── imports buildingsRegistry, itemRegistry, propertyRegistry, requestRegistry ← registry.ts
  └── imports gridKey ← world.ts

simulation.ts
  ├── imports WorldState, Building, BuildingType, ItemInstance, Direction, Sorter, Belt ← types.ts
  ├── imports MoveState ← types.ts
  ├── imports itemRegistry, requestRegistry ← registry.ts
  └── imports gridKey, getDirectionOffset ← world.ts

world.ts
  ├── imports WorldState, Building, ItemInstance, StaticObject ← types.ts
  ├── imports Direction ← types.ts
  └── imports mapRegistry, buildingsRegistry, requestRegistry ← registry.ts

registry.ts
  ├── imports all definition types ← types.ts
  └── imports all 5 JSON config files (static JSON imports via Vite)

types.ts
  └── (no imports — the root of all type dependencies)
```

**Dependency hierarchy (no circular dependencies):**
```
types.ts (leaf)
    ↑
registry.ts (depends on types + JSON)
    ↑
world.ts (depends on types + registry)
    ↑
simulation.ts (depends on types + registry + world)
    ↑
renderer.ts (depends on types + registry + world)
    ↑
input.ts (depends on types + renderer + world + registry + simulation)
    ↑
main.ts (depends on all of the above)
```

---

## 9. Configuration

### No Environment Variables
The project has no `.env` files and no runtime environment variable dependencies.

### JSON Config Files (all in `src/`)

**`buildings.config.json`** — 4 buildings defined:
- `emitter` — requires `preferredStaticTypes: ["garbage"]`; placed on garbage tiles only.
- `receiver` — consumes items, assigned requests round-robin.
- `belt` — transports items 1 cell in `direction` per tick.
- `sorter` — filters items; configurable `filterProperty` + `filterValue` at runtime via dialog.

**`items.config.json`** — 3 item types, each with 3 properties:
- `small-red-square`: `{ size: "small", shape: "square", color: "red" }`
- `large-blue-circle`: `{ size: "large", shape: "circle", color: "blue" }`
- `medium-green-triangle`: `{ size: "medium", shape: "triangle", color: "green" }`

**`properties.config.json`** — 3 property schemas:
- `color`: maps `red → "#ff4444"`, `green → "#44ff44"`, `blue → "#4444ff"` (used for SVG fill)
- `shape`: maps `square → "square"`, `circle → "circle"`, `triangle → "triangle"` (used to select SVG primitive)
- `size`: maps `small → 10`, `medium → 15`, `large → 20` (used as pixel size for the SVG shape)

**`requests.config.json`** — 3 request types:
- `small-red-stuff`: requires `color: ["red"]` AND `size: ["small"]`; reward $5, penalty $2
- `circular-objects`: requires `shape: ["circle"]`; reward $15, penalty $10
- `green-or-blue`: requires `color: ["green", "blue"]` (OR within the array); reward $10, penalty $5

**`map.config.json`**:
- `garbageRect`: `{x1: -15, y1: -15, x2: 15, y2: 15}` — a 30×30 grid region centered on origin
- `density`: `0.05` (5% of tiles will have garbage piles)
- `minSize`: 5, `maxSize`: 20 (tiles per garbage blob)
- `itemPool`: `["small-red-square", "large-blue-circle", "medium-green-triangle"]`

### TypeScript Configuration (`tsconfig.json`)
- Target: `ES2022`
- Module: `ESNext` with `bundler` resolution (Vite mode)
- Strict mode: ON (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- Special flags: `erasableSyntaxOnly: true`, `noUncheckedSideEffectImports: true`
- Globals available: `vite/client`, `vitest/globals` (so `describe/it/expect` are available without imports in test files)
- `noEmit: true` — TypeScript never produces output directly (Vite handles bundling)

### ESLint Configuration (`eslint.config.js`)
- Based on `typescript-eslint` recommended + ESLint recommended
- Key rules: `no-explicit-any: error`, `no-empty-object-type: error`, `no-unused-vars: error (argsIgnorePattern: ^_)`, `consistent-type-imports: error` (forces `import type` for type-only imports)

---

## 10. Build and Run

### Development
```bash
npm run dev        # Starts Vite dev server (hot module reload)
```
Default port: 5173 (Vite default). Opens in browser.

### Production Build
```bash
npm run build      # tsc (type check) + vite build → /dist/
npm run preview    # Serve the /dist/ directory locally
```

### Type Check Only (no emit)
```bash
npm run compile    # tsc --noEmit
```

### Linting
```bash
npm run lint       # eslint src/**
```

### Tests
```bash
npm test           # vitest (watch mode)
```
Or for a single run:
```bash
npm test -- --run  # vitest --run (CI mode)
```

Tests are colocated with source in `src/` as `*.test.ts` files. Vitest globals (`describe`, `it`, `expect`) are enabled via `tsconfig.json` `"types": ["vitest/globals"]` — no explicit imports needed in test files.

**Test files:**
- `src/world.test.ts` — tests `createWorld`, `placeBuilding`, `getDirectionOffset`, `getPortCell`, `gridKey`
- `src/simulation.test.ts` — tests belt chain movement, multi-item movement, round-robin merging, sorter filter logic, sorter-receiver regression cases
- `src/requests.test.ts` — tests round-robin request assignment to receivers, reward and penalty scoring

---

## 11. Notable Patterns and Conventions

### Coordinate System
- Origin `(0, 0)` is the center of the map (not the top-left corner of the screen).
- `X` increases East (right), `Y` increases South (down).
- All map positions are integer grid coordinates.
- Screen positions = `gridCoord * cellSize + panOffset` (applied via SVG transform).

### Map Key Convention
All three world Maps (`buildings`, `items`, `staticObjects`) use `"x,y"` string keys generated by `gridKey(x, y)` (which applies `Math.floor` to both). This is the universal addressing scheme. **Never manually construct `"x,y"` strings — always use `gridKey()`.**

### Direction Encoding
`Direction` is a `const` object (not a TypeScript `enum`) with values `{ N:0, E:1, S:2, W:3 }`. This is the "const enum" pattern — it compiles away to plain numbers while providing type safety. Rotation is `(dir + 1) % 4` for clockwise, `(dir + 3) % 4` for counter-clockwise. Rendering rotation in degrees: `(direction - 1) * 90`.

### Dual-Loop Architecture (Tick + Render Decoupled)
- `setInterval(500ms)` → runs `tickWorld()` — updates logical state (`x/y` integers, money, tick)
- `requestAnimationFrame` → runs `renderLoop()` → lerps `renderX/Y/Scale` toward logical values → calls `renderWorld()`

This separates game logic (runs at 2Hz) from rendering (runs at ~60fps), enabling smooth visual animation even though the simulation runs slowly.

### Lerp Animation
Item positions animate smoothly using linear interpolation each frame:
```typescript
item.renderX += (item.x - item.renderX) * tDelta * LERP_SPEED; // LERP_SPEED = 10
```
`renderScale` starts at 0 on spawn and lerps to 1. On death (item removed from simulation), it lerps back toward 0 and is deleted from `dyingItems` when `renderScale < 0.01`.

### Double-Buffer State Update
`executeTickets` never mutates `world.items` in place during iteration. It reads from a snapshot (`prevItems`) and writes to a fresh `nextItems` map, then atomically swaps: `world.items = nextItems`. This avoids tick-order bugs where a moved item could be moved again in the same tick.

### Round-Robin Arbitration (Belt Merging)
When multiple items compete to enter the same cell, the winner is chosen by clockwise priority starting from `(lastInputIndex + 1) % 4`. The building stores `lastInputIndex: Direction` tracking which direction the last accepted item came from. This ensures fair, alternating throughput at merge points.

### Sorter Pull Tickets
Sorters don't wait for items to be pushed into them — they actively *inject intents* into the existing belt ticket system. In Phase 1 Pass 2, sorters scan their input cell and either:
1. Prepend themselves to an existing belt ticket's intent list (side-pull or same-direction).
2. Create a new `pull:` ticket if no belt is present on the input cell.

This ensures sorters have priority over the main belt line without needing a separate simulation phase.

### Cycle Detection in Deadlocks
DFS cycle detection in `checkCanMove()` uses the EVALUATING state: if DFS revisits a ticket already in EVALUATING state, a cycle is detected and the function returns `true` (allowing the circular chain to move). This solves the classic conveyor belt loop problem where items would deadlock in a circle.

### Preferred Static Types (Placement Constraint)
Buildings can declare `preferredStaticTypes` in their JSON config. `placeBuilding()` enforces this: if a building requires placement on a `"garbage"` tile (only `emitter` currently), it checks `world.staticObjects` and rejects placement elsewhere. The renderer shows a red ghost preview when this constraint is violated.

### Type Import Convention
ESLint enforces `consistent-type-imports`. All imports used only as types must use `import type { ... }`. This is consistently applied across all source files.

### `counter.ts` and `style.css`
These are **leftover artifacts from the Vite TypeScript project scaffold**. They are not used by the game. `counter.ts` exports a click counter button setup. `style.css` is a generic Vite template stylesheet. Both are safe to ignore. The actual game CSS lives as inline `<style>` in `index.html`.

---

## 12. Adding New Features — Practical Guide

### Adding a New Building Type
1. Add the TypeScript interface in `types.ts` extending `BaseBuilding` with `type: 'new-type'`.
2. Add `'new-type'` to the `BuildingType` union in `types.ts`.
3. Add a definition entry to `buildings.config.json` (id, name, type, iconPath, optional ports/preferredStaticTypes).
4. Add an SVG icon to `public/icons/`.
5. In `simulation.ts`:
   - Add a case in `generateIntents()` in Phase 1 to create tickets for items on/near this building.
   - Create a `BuildingHandler` subclass with an `accept()` method.
   - Register it in the `handlers` Map.
6. Add rendering logic in `renderer.ts` inside `renderWorld()` if special visual treatment is needed.

### Adding New Item Properties
1. Add a new property entry to `properties.config.json` with `id`, `name`, and `values` map.
2. Reference the property in item definitions in `items.config.json`.
3. Reference the property in request conditions in `requests.config.json`.
4. Update renderer logic in `renderer.ts` if the new property should affect visual rendering.

### Adding New Requests
1. Add an entry to `requests.config.json` with `id`, `name`, `properties` (multi-value conditions), `cost`, and `penalty`.
2. The `requestRegistry.getNextRequest()` round-robin will automatically include it.
3. Scoring in `scoreReceiver()` already handles multi-value property conditions generically.
