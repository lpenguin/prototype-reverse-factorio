import type { WorldState, Building, ItemInstance } from './types.ts';
import { Direction } from './types.ts';

/**
 * Convert grid coordinates to a consistent string key
 */
export function gridKey(x: number, y: number): string {
  return `${Math.floor(x)},${Math.floor(y)}`;
}

/**
 * Calculate the (dx, dy) offset for a given 4-way direction
 */
export function getDirectionOffset(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case Direction.N: return { dx: 0, dy: -1 };
    case Direction.E: return { dx: 1, dy: 0 };
    case Direction.S: return { dx: 0, dy: 1 };
    case Direction.W: return { dx: -1, dy: 0 };
    default: return { dx: 0, dy: 0 };
  }
}

/**
 * Initialize a new world state
 */
export function createWorld(): WorldState {
  return {
    buildings: new Map(),
    items: new Map(),
    playerMoney: 0,
    tick: 0,
    isPaused: false,
  };
}

/**
 * Place a building in the world
 * @returns true if building was placed, false if spot was occupied
 */
export function placeBuilding(world: WorldState, building: Building): boolean {
  const key = gridKey(building.x, building.y);
  if (world.buildings.has(key)) return false;
  world.buildings.set(key, building);
  return true;
}

/**
 * Remove a building from the world
 */
export function removeBuilding(world: WorldState, x: number, y: number): boolean {
  return world.buildings.delete(gridKey(x, y));
}

/**
 * Add an item instance to the world at (x, y)
 */
export function addItem(world: WorldState, item: ItemInstance): boolean {
  const key = gridKey(item.x, item.y);
  if (world.items.has(key)) return false;
  item.renderX ??= item.x;
  item.renderY ??= item.y;
  item.renderScale ??= 0;
  world.items.set(key, item);
  return true;
}

/**
 * Remove an item at (x, y)
 */
export function removeItem(world: WorldState, x: number, y: number): ItemInstance | undefined {
  const key = gridKey(x, y);
  const item = world.items.get(key);
  if (item) world.items.delete(key);
  return item;
}

/**
 * Get the target port cell for a building (for emitters/receivers)
 */
export function getPortCell(building: { x: number; y: number }, dir: Direction): { x: number; y: number } {
  const { dx, dy } = getDirectionOffset(dir);
  return { x: building.x + dx, y: building.y + dy };
}
