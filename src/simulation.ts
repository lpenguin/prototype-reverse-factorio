import type { WorldState, Building, BuildingType, ItemInstance, Emitter, Belt, Receiver } from './types.ts';
import { itemRegistry } from './registry.ts';
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
    if (emitter.itemPool.length === 0) return;
    const itemDefId = emitter.itemPool[0];
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

  accept(world: WorldState, _receiver: Receiver, item: ItemInstance): boolean {
    const def = itemRegistry.getItem(item.defId);
    if (def) {
      world.playerMoney += def.cost;
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

  // Belts first — advance items before emitters fire
  for (const building of world.buildings.values()) {
    if (building.type === 'belt') {
      getHandler('belt')!.tick(world, building, ctx);
    }
  }

  // Emitters last — newly emitted items wait at least one tick before moving
  for (const building of world.buildings.values()) {
    if (building.type === 'emitter') {
      getHandler('emitter')!.tick(world, building, ctx);
    }
  }
}
