import type { WorldState, Building, ItemInstance, Receiver } from './types.ts';
import { Direction } from './types.ts';
import { buildingsRegistry, requestRegistry, itemRegistry } from './registry.ts';

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
  const world: WorldState = {
    buildings: new Map(),
    items: new Map(),
    wireCells: new Set(),
    signals: new Map(),
    buildingSecondary: new Map(),
    requests: [], // Start with an empty repository
    playerMoney: 0,
    tick: 0,
    isPaused: false,
  };

  // Add a few initial requests to get started
  for (let i = 0; i < 3; i++) {
    world.requests.push(requestRegistry.generateRandomRequest());
  }

  return world;
}

/**
 * Returns true if a cell is occupied by a building (anchor or secondary).
 */
export function isCellOccupied(world: WorldState, key: string): boolean {
  return world.buildings.has(key) || world.buildingSecondary.has(key);
}

/**
 * Place a building in the world
 * @returns true if building was placed, false if spot was occupied or invalid
 */
export function placeBuilding(world: WorldState, building: Building): boolean {
  const key = gridKey(building.x, building.y);
  if (isCellOccupied(world, key)) return false;

  const def = buildingsRegistry.getAllBuildings().find(d => d.type === building.type);

  // For multi-cell buildings, reserve the secondary (perpendicular-right) cell
  if (def && (def.size.x > 1 || def.size.y > 1)) {
    const { dx, dy } = getDirectionOffset(building.direction);
    const secondaryKey = gridKey(building.x - dy, building.y + dx);
    if (isCellOccupied(world, secondaryKey)) return false;
    world.buildingSecondary.set(secondaryKey, key);
  }

  if (building.type === 'receiver') {
    (building as Receiver).request = requestRegistry.getDefaultRequest();
  } else if (building.type === 'button') {
    (building as { isOn: boolean }).isOn = (building as { isOn?: boolean }).isOn ?? true;
  }

  world.buildings.set(key, building);
  return true;
}

/**
 * Remove a building from the world.
 * If the given coordinates are a secondary cell, the anchor building is removed.
 */
export function removeBuilding(world: WorldState, x: number, y: number): boolean {
  let key = gridKey(x, y);
  // If the target is a secondary cell, redirect to its anchor building
  const anchorKey = world.buildingSecondary.get(key);
  if (anchorKey !== undefined) key = anchorKey;
  // Clean up any secondary cells pointing to this anchor
  for (const [secKey, ak] of world.buildingSecondary) {
    if (ak === key) {
      world.buildingSecondary.delete(secKey);
      break;
    }
  }
  return world.buildings.delete(key);
}

let _itemIdCounter = 0;
export function nextItemId(): string {
  return `item-${++_itemIdCounter}`;
}

/**
 * Add an item instance to the world at (x, y).
 * `id` is optional here — if omitted, a stable unique id is auto-assigned.
 */
export function addItem(world: WorldState, item: Omit<ItemInstance, 'id'> & { id?: string }): boolean {
  const key = gridKey(item.x, item.y);
  if (world.items.has(key)) return false;
  const itemDef = itemRegistry.getItem(item.defId);
  if (!item.shape) item.shape = typeof itemDef?.properties.shape === 'string' ? itemDef.properties.shape : undefined;
  if (!item.color) item.color = typeof itemDef?.properties.color === 'string' ? itemDef.properties.color : undefined;
  if (!item.size) item.size = typeof itemDef?.properties.size === 'string' ? itemDef.properties.size : undefined;
  if (!item.id) (item as ItemInstance).id = nextItemId();
  if (item.renderX == null) (item as ItemInstance).renderX = item.x;
  if (item.renderY == null) (item as ItemInstance).renderY = item.y;
  if (item.renderScale == null) (item as ItemInstance).renderScale = 0;
  world.items.set(key, item as ItemInstance);
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

export function parseGridKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function getOrthogonalDragCells(start: { x: number; y: number }, end: { x: number; y: number }): string[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (horizontal) {
    const y = start.y;
    const from = Math.min(start.x, end.x);
    const to = Math.max(start.x, end.x);
    const cells: string[] = [];
    for (let x = from; x <= to; x++) cells.push(gridKey(x, y));
    return cells;
  }

  const x = start.x;
  const from = Math.min(start.y, end.y);
  const to = Math.max(start.y, end.y);
  const cells: string[] = [];
  for (let y = from; y <= to; y++) cells.push(gridKey(x, y));
  return cells;
}

export function addWireCells(world: WorldState, cellKeys: string[]): void {
  for (const key of cellKeys) {
    world.wireCells.add(key);
  }
}
