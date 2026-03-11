import type { WorldState, Building, BuildingType, ItemInstance, Emitter, Belt, Receiver, Sorter } from './types.ts';
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

/**
 * Shared round-robin input evaluation.
 *
 * Given a list of source belt keys feeding into a building whose cell is
 * `receiverKey`, evaluates each upstream belt (recursively, sink-to-source)
 * and allows at most one item to flow in per tick — cycling sources in
 * round-robin order based on `lastInputIndex`.
 *
 * Returns the updated lastInputIndex value (unchanged if nothing arrived).
 */
export function evaluateRoundRobinSources(
  world: WorldState,
  receiverKey: string,
  sources: string[],
  lastInputIndex: number | undefined,
  beltMap: Map<string, Belt>,
  evaluateBelt: (belt: Belt) => void,
): number | undefined {
  if (sources.length === 0) return lastInputIndex;

  const sorted = [...sources].sort();
  const canReceive = !world.items.has(receiverKey);
  const startIndex = ((lastInputIndex ?? -1) + 1) % sorted.length;
  const rotated = [
    ...sorted.slice(startIndex),
    ...sorted.slice(0, startIndex),
  ];

  let newLastInputIndex = lastInputIndex;
  let receivedThisTick = false;

  for (const sourceKey of rotated) {
    const sourceBelt = beltMap.get(sourceKey);
    if (sourceBelt) {
      evaluateBelt(sourceBelt);

      if (canReceive && !receivedThisTick && world.items.has(receiverKey)) {
        newLastInputIndex = sorted.indexOf(sourceKey);
        receivedThisTick = true;
      }
    }
  }

  return newLastInputIndex;
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

class SorterHandler extends BuildingHandler<Sorter> {
  /**
   * Each tick the sorter:
   * 1. Pushes any item sitting on its cell forward to the output cell.
   * 2. If its own cell is now empty, pulls a matching item from the input cell.
   *
   * The "input cell" is the tile directly behind the sorter (opposite of its
   * facing direction). The "output cell" is the tile directly in front.
   */
  tick(world: WorldState, sorter: Sorter, ctx: TickContext): void {
    const key = gridKey(sorter.x, sorter.y);
    const { dx, dy } = getDirectionOffset(sorter.direction);

    // --- Step 1: push item already on the sorter cell to the output ---
    const carried = world.items.get(key);
    if (carried && !ctx.movedItems.has(key)) {
      const outX = sorter.x + dx;
      const outY = sorter.y + dy;
      const moved = moveItem(world, sorter.x, sorter.y, outX, outY, ctx);
      if (moved) {
        ctx.movedItems.add(gridKey(outX, outY));
      }
    }

    // --- Step 2: pull a matching item from the input cell ---
    if (!world.items.has(key)) {
      const inX = sorter.x - dx;
      const inY = sorter.y - dy;
      const inKey = gridKey(inX, inY);
      const candidate = world.items.get(inKey);

      if (candidate && !ctx.movedItems.has(inKey) && this.itemMatchesFilter(candidate, sorter)) {
        const moved = moveItem(world, inX, inY, sorter.x, sorter.y, ctx);
        if (moved) {
          ctx.movedItems.add(key);
        }
      }
    }
  }

  /**
   * Accept an item pushed directly into the sorter cell (e.g. from a belt
   * pointing into the sorter's front face). Only accepts if the item matches
   * the configured filter and the cell is free.
   */
  accept(world: WorldState, sorter: Sorter, item: ItemInstance): boolean {
    const key = gridKey(sorter.x, sorter.y);
    if (world.items.has(key)) return false;
    if (!this.itemMatchesFilter(item, sorter)) return false;
    item.x = sorter.x;
    item.y = sorter.y;
    world.items.set(key, item);
    return true;
  }

  /** Returns true if the item satisfies the sorter's property filter. */
  itemMatchesFilter(item: ItemInstance, sorter: Sorter): boolean {
    if (!sorter.filterProperty || !sorter.filterValue) return true; // no filter → pass all
    const itemDef = itemRegistry.getItem(item.defId);
    if (!itemDef) return false;
    const val = String(itemDef.properties[sorter.filterProperty] ?? '');
    return val === sorter.filterValue;
  }
}

const sorterHandlerInstance = new SorterHandler();

const handlers = new Map<BuildingType, BuildingHandler<Building>>([
  ['emitter', new EmitterHandler()],
  ['belt', new BeltHandler()],
  ['receiver', new ReceiverHandler()],
  ['sorter', sorterHandlerInstance],
]);

export function getHandler(type: BuildingType): BuildingHandler<Building> | undefined {
  return handlers.get(type);
}

export { sorterHandlerInstance as sorterHandler };

/**
 * Advance the simulation by one tick.
 *
 * Evaluation order:
 *   1. Belts: sink-to-source DFS with round-robin merge (prevents double-move).
 *   2. Sorters: each sorter evaluates upstream belts (round-robin), then ticks.
 *   3. Emitters: fire last so newly-spawned items wait a tick before moving.
 */
export function tickWorld(world: WorldState): void {
  world.tick++;
  const ctx: TickContext = { movedItems: new Set() };

  // --- Build belt dependency graph ---
  const belts = Array.from(world.buildings.values()).filter(b => b.type === 'belt') as Belt[];
  const sorters = Array.from(world.buildings.values()).filter(b => b.type === 'sorter') as Sorter[];

  const beltMap = new Map<string, Belt>();
  // beltIncoming: targetBeltKey → source belt keys
  const beltIncoming = new Map<string, string[]>();
  const sinks: Belt[] = [];

  // Map from a belt's key to the sorter(s) whose input cell it is.
  // When the belt-phase DFS is about to tick such a belt, it first lets the
  // sorter pull a matching item (giving the sorter priority over the receiver
  // chain). The belt then ticks normally: if the sorter took the item the belt
  // is already empty; if the sorter rejected it the item advances down the
  // main line as usual.
  const beltKeyToSorter = new Map<string, Sorter>();
  for (const sorter of sorters) {
    const { dx, dy } = getDirectionOffset(sorter.direction);
    const inKey = gridKey(sorter.x - dx, sorter.y - dy);
    beltKeyToSorter.set(inKey, sorter);
  }

  for (const belt of belts) {
    const bKey = gridKey(belt.x, belt.y);
    beltMap.set(bKey, belt);

    const { dx, dy } = getDirectionOffset(belt.direction);
    const tx = belt.x + dx;
    const ty = belt.y + dy;
    const targetKey = gridKey(tx, ty);
    const targetBuilding = world.buildings.get(targetKey);

    if (targetBuilding && targetBuilding.type === 'belt') {
      // belt → belt edge
      if (!beltIncoming.has(targetKey)) beltIncoming.set(targetKey, []);
      beltIncoming.get(targetKey)!.push(bKey);
    } else {
      // Everything else (receiver, sorter output side, empty space): sink.
      sinks.push(belt);
    }
  }

  // sorterIncoming: sorterKey → list of belt keys that feed its input cell
  const sorterIncoming = new Map<string, string[]>();
  for (const sorter of sorters) {
    const { dx, dy } = getDirectionOffset(sorter.direction);
    const inKey = gridKey(sorter.x - dx, sorter.y - dy);
    const sorterKey = gridKey(sorter.x, sorter.y);
    if (beltMap.has(inKey)) {
      if (!sorterIncoming.has(sorterKey)) sorterIncoming.set(sorterKey, []);
      sorterIncoming.get(sorterKey)!.push(inKey);
    }
  }

  // --- Sink-to-source belt evaluation ---
  const visited = new Set<string>();
  // Tracks which sorters have already been evaluated (either inline during the
  // belt phase or in the explicit sorter phase below).
  const sorterVisited = new Set<string>();
  const beltHandler = getHandler('belt')!;

  function evaluateBelt(belt: Belt): void {
    const key = gridKey(belt.x, belt.y);
    if (visited.has(key)) return;
    visited.add(key);

    // If this belt is the input cell of a sorter, let the sorter pull a
    // matching item first (before the belt ticks). This gives the sorter
    // priority: if it takes the item the belt will be empty when it ticks
    // and the item moves down the sorter path; if it rejects the item the
    // belt ticks normally and the item continues down the main line.
    const pendingSorter = beltKeyToSorter.get(key);
    if (pendingSorter) {
      const sorterKey = gridKey(pendingSorter.x, pendingSorter.y);
      if (!sorterVisited.has(sorterKey)) {
        sorterVisited.add(sorterKey);
        const { dx: sdx, dy: sdy } = getDirectionOffset(pendingSorter.direction);
        const inputCellKey = gridKey(pendingSorter.x - sdx, pendingSorter.y - sdy);
        const sources = sorterIncoming.get(sorterKey) || [];
        pendingSorter.lastInputIndex = evaluateRoundRobinSources(
          world, inputCellKey, sources, pendingSorter.lastInputIndex, beltMap, evaluateBelt,
        );
        getHandler('sorter')!.tick(world, pendingSorter, ctx);
      }
    }

    // Push item OUT of this belt (after sorter had first pick)
    beltHandler.tick(world, belt, ctx);

    // Then pull from upstream sources in round-robin
    const sources = beltIncoming.get(key) || [];
    belt.lastInputIndex = evaluateRoundRobinSources(
      world, key, sources, belt.lastInputIndex, beltMap, evaluateBelt,
    );
  }

  for (const sink of sinks) {
    evaluateBelt(sink);
  }
  // Catch any remaining belts (cycles or isolated)
  for (const belt of belts) {
    evaluateBelt(belt);
  }

  // --- Sorter evaluation ---
  // Handle sorters whose input belt was NOT reached by the belt-phase DFS
  // (e.g. the belt-before-sorter is isolated or feeds nothing downstream).
  for (const sorter of sorters) {
    const sorterKey = gridKey(sorter.x, sorter.y);
    if (sorterVisited.has(sorterKey)) continue; // already handled inline
    sorterVisited.add(sorterKey);

    const { dx, dy } = getDirectionOffset(sorter.direction);
    const inputCellKey = gridKey(sorter.x - dx, sorter.y - dy);

    const sources = sorterIncoming.get(sorterKey) || [];
    sorter.lastInputIndex = evaluateRoundRobinSources(
      world, inputCellKey, sources, sorter.lastInputIndex, beltMap, evaluateBelt,
    );

    getHandler('sorter')!.tick(world, sorter, ctx);
  }

  // --- Emitters last ---
  for (const building of world.buildings.values()) {
    if (building.type === 'emitter') {
      getHandler('emitter')!.tick(world, building, ctx);
    }
  }
}
