# AI-Friendly Documentation: Prototype Reverse Factorio

This document provides a high-level technical overview of the `prototype-reverse-factorio` project to help AI agents understand the codebase quickly.

## Project Overview
A grid-based simulation game inspired by Factorio, but with a "reverse" twist.
- **Core Loop**: Emitters produce items -> Belts transport items -> Receivers consume items for money.
- **Tech Stack**: TypeScript (no framework), Vite, Vitest for testing.
- **Rendering**: SVG-based world rendering. The entire world is inside a `<g>` element with pan and zoom transforms.
- **Tick Rate**: Default simulation tick is 500ms (2 ticks per second).

## Core Data Structures (`src/types.ts`)
- **`Direction`**: 4-way system (0: North, 1: East, 2: South, 3: West).
- **`WorldState`**: The source of truth for the simulation.
  - `buildings`: `Map<string, Building>` where keys are `"x,y"` (via `gridKey`).
  - `items`: `Map<string, ItemInstance>` where keys are `"x,y"`.
  - `playerMoney`: Numeric balance.
  - `tick`: Current simulation step.
  - `isPaused`: Boolean flag to halt simulation.
- **`Building`**: Entities on the grid. Types: `emitter`, `belt`, `receiver`.
- **`ItemInstance`**: Objects moving on the grid.
  - `defId`: Links to `ItemDefinition`.
  - `x`, `y`: Logical grid coordinates.
  - `renderX`, `renderY`, `renderScale`: Interpolated values used for smooth rendering.

## Simulation Logic (`src/simulation.ts`)
- **Tick System**: `tickWorld(world)` advances the state every 500ms (configured in `main.ts`).
  1. **Belts move items**: Items on belts move forward if the destination is clear or a building accepts them.
  2. **Emitters fire**: New items are created and placed on the grid (or directly into adjacent buildings).
- **Handlers**: Each building type has a `BuildingHandler` implementing `tick` and `accept`.
  - `accept(world, building, item)`: Determines if a building can receive an item from a neighbor.

## Rendering & Animation (`src/main.ts`, `src/renderer.ts`)
- **Render Loop**: Uses `requestAnimationFrame` to interpolate `renderX`, `renderY`, and `renderScale` towards their logical counterparts (`x`, `y`).
- **Smooth Movement**: `LERP_SPEED` and `SCALE_SPEED` constants control the transition smoothness.
- **Dying Items**: Items removed during a tick are moved to a `dyingItems` Map to allow for a "disappear" animation before final deletion.

## Grid Utilities (`src/world.ts`)
- **`gridKey(x, y)`**: Generates Map keys: `return \`\${Math.floor(x)},\${Math.floor(y)}\`;`.
- **`getDirectionOffset(dir)`**: Returns `{dx, dy}` for a given `Direction`.
- **`getPortCell(building, dir)`**: Calculates the target tile in front of a building.
- **`addItem` / `removeBuilding`**: CRUD operations for the world state.

## Configuration & Registries (`src/registry.ts`)
- **`buildingsRegistry`**: Loads from `src/buildings.config.json`. Use `getBuilding(id)` or `getAllBuildings()`.
- **`itemRegistry`**: Loads from `src/items.config.json`. Use `getItem(id)` or `getAllItems()`.

## Development & Extension
- **Adding a Building**:
  1. Update `BuildingType` in `types.ts`.
  2. Add definition to `buildings.config.json`.
  3. Implement a `BuildingHandler` in `simulation.ts` and register it in the `handlers` map.
- **Modifying Simulation**: Main logic resides in `moveItem` and the various `tick` implementations in `simulation.ts`.
- **Testing**: Use `npm test` to run `vitest`. Logic tests should be added to `src/world.test.ts` or new `.test.ts` files.

## Conventions
- **Coordinate System**: (0,0) is top-left. Y increases downwards.
- **Immutability**: While `WorldState` is often mutated in-place during ticks for performance, logic should remain predictable and avoid side effects outside the provided state object.
