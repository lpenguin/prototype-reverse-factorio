import type { WorldState, Building, BuildingType, ItemInstance, Emitter, Belt, Receiver } from './types.ts';
import { itemRegistry, requestRegistry } from './registry.ts';
import { gridKey, getDirectionOffset, addItem } from './world.ts';

export interface TickContext {
  movedItems: Set<string>;
}

abstract class BuildingHandler<T extends Building> {
  abstract tick(world: WorldState, building: T, ctx: TickContext): void;
  abstract accept(world: WorldState, building: T, item: ItemInstance): boolean;
}

/**
 * Move an item from (fromX, fromY) to (toX, toY).
 * If a building occupies the destination, calls its accept().
 * Returns true if the item was moved or accepted.
 */
export function moveItem(
  world: WorldState,
  fromX: number, fromY: number,
  toX: number, toY: number,
  _ctx: TickContext,
): boolean {
  const fromKey = gridKey(fromX, fromY);
  const toKey = gridKey(toX, toY);
  const item = world.items.get(fromKey);
  if (!item) return false;

  const targetBuilding = world.buildings.get(toKey);
  if (targetBuilding) {
    const handler = getHandler(targetBuilding.type);
    if (handler && handler.accept(world, targetBuilding, item)) {
      item.x = toX;
      item.y = toY;
      world.items.delete(fromKey);
      return true;
    }
    return false;
  }

  if (world.items.has(toKey)) return false;

  world.items.delete(fromKey);
  item.x = toX;
  item.y = toY;
  world.items.set(toKey, item);
  return true;
}

class EmitterHandler extends BuildingHandler<Emitter> {
  tick(world: WorldState, emitter: Emitter, _ctx: TickContext): void {
    const key = gridKey(emitter.x, emitter.y);
    const staticObj = world.staticObjects.get(key);
    if (!staticObj || staticObj.type !== 'garbage' || staticObj.itemPool.length === 0) return;

    // Randomly pick an item from the item pool
    const itemIndex = Math.floor(Math.random() * staticObj.itemPool.length);
    const itemDefId = staticObj.itemPool[itemIndex];
    const { dx, dy } = getDirectionOffset(emitter.direction);
    const tx = emitter.x + dx;
    const ty = emitter.y + dy;
    if (world.items.has(gridKey(tx, ty))) return;

    const targetBuilding = world.buildings.get(gridKey(tx, ty));
    if (targetBuilding) {
      const handler = getHandler(targetBuilding.type);
      if (handler) {
        handler.accept(world, targetBuilding as never, { defId: itemDefId, x: emitter.x, y: emitter.y, renderX: emitter.x, renderY: emitter.y, renderScale: 0 });
      }
      return;
    }
    addItem(world, { defId: itemDefId, x: tx, y: ty, renderX: tx, renderY: ty, renderScale: 0 });
  }

  accept(_world: WorldState, _emitter: Emitter, _item: ItemInstance): boolean {
    return false;
  }
}

class BeltHandler extends BuildingHandler<Belt> {
  tick(world: WorldState, belt: Belt, ctx: TickContext): void {
    const key = gridKey(belt.x, belt.y);
    const item = world.items.get(key);
    if (!item || ctx.movedItems.has(key)) return;
    const { dx, dy } = getDirectionOffset(belt.direction);
    const tx = belt.x + dx;
    const ty = belt.y + dy;
    const moved = moveItem(world, belt.x, belt.y, tx, ty, ctx);
    if (moved) {
      ctx.movedItems.add(gridKey(tx, ty));
    }
  }

  accept(world: WorldState, belt: Belt, item: ItemInstance): boolean {
    const key = gridKey(belt.x, belt.y);
    if (world.items.has(key)) return false;
    item.x = belt.x;
    item.y = belt.y;
    world.items.set(key, item);
    return true;
  }
}

class ReceiverHandler extends BuildingHandler<Receiver> {
  tick(_world: WorldState, _receiver: Receiver, _ctx: TickContext): void {
    // Receivers are passive
  }

  accept(world: WorldState, receiver: Receiver, item: ItemInstance): boolean {
    const itemDef = itemRegistry.getItem(item.defId);
    if (!itemDef) return true;

    if (!receiver.requestId) {
      // If no request is assigned, we get nothing or maybe some default?
      // The prompt says "if the received item matches the request we get item cost money"
      // If there is no request, let's say it's just basic disposal (0 money) or we keep it as is if they still want some reward.
      // Given the prompt "each receiver gets a round robin request", receivers should usually have one.
      return true;
    }

    const request = requestRegistry.getRequest(receiver.requestId);
    if (!request) {
      return true;
    }

    let matches = true;
    for (const [prop, condition] of Object.entries(request.properties)) {
      const itemValue = itemDef.properties[prop];

      if (!condition.includes(String(itemValue))) {
        matches = false;
        break;
      }
    }

    if (matches) {
      world.playerMoney += request.cost;
    } else {
      world.playerMoney -= request.penalty;
    }

    return true;
  }
}

const handlers = new Map<BuildingType, BuildingHandler<Building>>([
  ['emitter', new EmitterHandler()],
  ['belt', new BeltHandler()],
  ['receiver', new ReceiverHandler()],
]);

export function getHandler(type: BuildingType): BuildingHandler<Building> | undefined {
  return handlers.get(type);
}

/**
 * Advance the simulation by one tick.
 */
export function tickWorld(world: WorldState): void {
  world.tick++;
  const ctx: TickContext = { movedItems: new Set() };

  // 1. Identify all belts and build a dependency map (target -> sources)
  const belts = Array.from(world.buildings.values()).filter(b => b.type === 'belt') as Belt[];
  const beltMap = new Map<string, Belt>();
  const incoming = new Map<string, string[]>(); // targetKey -> sourceKeys[]
  const sinks: Belt[] = [];

  for (const belt of belts) {
    const bKey = gridKey(belt.x, belt.y);
    beltMap.set(bKey, belt);

    const { dx, dy } = getDirectionOffset(belt.direction);
    const tx = belt.x + dx;
    const ty = belt.y + dy;
    const targetKey = gridKey(tx, ty);
    const targetBuilding = world.buildings.get(targetKey);

    if (targetBuilding && targetBuilding.type === 'belt') {
      if (!incoming.has(targetKey)) incoming.set(targetKey, []);
      incoming.get(targetKey)!.push(bKey);
    } else {
      sinks.push(belt);
    }
  }

  // 2. Evaluate belts starting from sinks, moving backwards (Sink-to-Source order)
  const visited = new Set<string>();
  const beltHandler = getHandler('belt')!;

  function evaluateBelt(belt: Belt) {
    const key = gridKey(belt.x, belt.y);
    if (visited.has(key)) return;
    visited.add(key);

    // Evaluate tick at this belt (moves item OUT)
    beltHandler.tick(world, belt, ctx);

    // Check if the belt is now empty and can receive an item
    const canReceive = !world.items.has(key);

    // Find belts pointing to this belt and evaluate them
    const sources = incoming.get(key) || [];
    if (sources.length > 0) {
      sources.sort();
      
      // Calculate start index based on last successful input
      const startIndex = ((belt.lastInputIndex ?? -1) + 1) % sources.length;
      const rotatedSources = [
        ...sources.slice(startIndex),
        ...sources.slice(0, startIndex)
      ];
      
      let receivedThisTick = false;
      for (const sourceKey of rotatedSources) {
        const sourceBelt = beltMap.get(sourceKey);
        if (sourceBelt) {
          evaluateBelt(sourceBelt);
          
          // If this source successfully moved an item into our belt, update the priority
          if (canReceive && !receivedThisTick && world.items.has(key)) {
            belt.lastInputIndex = sources.indexOf(sourceKey);
            receivedThisTick = true;
          }
        }
      }
    }
  }

  for (const sink of sinks) {
    evaluateBelt(sink);
  }

  // Handle any remaining belts (e.g. cycles not connected to a sink)
  for (const belt of belts) {
    evaluateBelt(belt);
  }

  // 3. Emitters last — newly emitted items wait at least one tick before moving
  for (const building of world.buildings.values()) {
    if (building.type === 'emitter') {
      getHandler('emitter')!.tick(world, building, ctx);
    }
  }
}
