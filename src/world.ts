import type { WorldState, Building, ItemInstance, StaticObject } from './types.ts';
import { Direction } from './types.ts';
import { mapRegistry, buildingsRegistry } from './registry.ts';

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
    staticObjects: new Map(),
    playerMoney: 0,
    tick: 0,
    isPaused: false,
  };

  generateGarbage(world);

  return world;
}

/**
 * Generate garbage piles based on map configuration
 */
function generateGarbage(world: WorldState) {
  const { garbageRect, density, minSize, maxSize } = mapRegistry;
  const area = (garbageRect.x2 - garbageRect.x1) * (garbageRect.y2 - garbageRect.y1);
  const averageSize = (minSize + maxSize) / 2;
  const numPiles = Math.floor(area * density / averageSize);

  for (let i = 0; i < numPiles; i++) {
    const startX = Math.floor(Math.random() * (garbageRect.x2 - garbageRect.x1)) + garbageRect.x1;
    const startY = Math.floor(Math.random() * (garbageRect.y2 - garbageRect.y1)) + garbageRect.y1;
    
    // Grow a blob
    const pileSize = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
    const queue: Array<{x: number, y: number}> = [{x: startX, y: startY}];
    const visited = new Set<string>();
    
    let added = 0;
    while (queue.length > 0 && added < pileSize) {
      const {x, y} = queue.shift()!;
      const key = gridKey(x, y);
      
      if (visited.has(key)) continue;
      visited.add(key);
      
      if (!world.staticObjects.has(key)) {
        world.staticObjects.set(key, { type: 'garbage', x, y, itemPool: mapRegistry.itemPool } as StaticObject);
        added++;
        
        // Add neighbors to queue in random order
        const neighbors = [
          {x: x + 1, y}, {x: x - 1, y}, {x, y: y + 1}, {x, y: y - 1}
        ].sort(() => Math.random() - 0.5);
        
        queue.push(...neighbors);
      }
    }
  }
}

/**
 * Place a building in the world
 * @returns true if building was placed, false if spot was occupied or invalid
 */
export function placeBuilding(world: WorldState, building: Building): boolean {
  const key = gridKey(building.x, building.y);
  if (world.buildings.has(key)) return false;

  // Check preferred static types
  const def = buildingsRegistry.getAllBuildings().find(d => d.type === building.type);
  if (def?.preferredStaticTypes && def.preferredStaticTypes.length > 0) {
    const staticObj = world.staticObjects.get(key);
    if (!staticObj || !def.preferredStaticTypes.includes(staticObj.type)) {
      return false;
    }
  }

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
