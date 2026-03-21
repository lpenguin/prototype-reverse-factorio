/**
 * simulation.ts — tick algorithm
 *
 * Pre-phase: Item Spawning (generateNewItems)
 *   Emitters with a non-empty item pool and no item on their cell spawn a new
 *   real item at the emitter cell.  The item then participates in phases 1-3
 *   like any other item.
 *
 * Phase 1: Intent Generation (generateIntents)
 *   Every item declares an ordered list of desired destination cells ("intents").
 *
 *   - Item on a Belt:  intents = [belt_forward]
 *     Special case: if a powered Arm targets this cell, the arm intent
 *     (outputKey) is prepended as the primary intent (belt_forward = fallback).
 *   - Item on an Emitter: intents = [emitter_forward]
 *
 * Phase 2: Iterative Resolution (resolveIntents)
 *   Proposals are gathered, merge conflicts resolved by Round-Robin (clockwise
 *   from last accepted direction), and DFS cycle detection unlocks circular
 *   moving loops.  Losers / blocked items try their next intent (Overflow).
 *
 * Phase 3: Execution (executeTickets — double-buffer)
 *   A new nextItems map is built.  LOCKED_MOVING items are placed in nextItems
 *   at their target; BLOCKED items are kept at their current cell.
 *   Receivers consume arriving items.  Round-robin state is updated,
 *   then world.items = nextItems.
 */

import type {
  WorldState,
  Building,
  BuildingType,
  ItemInstance,
  Direction,
  Belt,
  Receiver,
  Emitter,
  Scanner,
  Arm,
  Button,
  Lamp,
} from './types.ts';
import { MoveState } from './types.ts';
import { itemRegistry } from './registry.ts';
import { gridKey, getDirectionOffset, nextItemId } from './world.ts';

// ---------------------------------------------------------------------------
// Internal per-tick data structure
// ---------------------------------------------------------------------------

interface Ticket {
  /** Grid key of the source cell ("x,y"). */
  id: string;
  /** The item being moved. */
  item: ItemInstance;
  /** Source cell key (where the item currently is). */
  sourceKey: string;
  /** Ordered list of candidate destination grid-keys. */
  intents: string[];
  /** Index into `intents` currently being tried. */
  intentIndex: number;
  /** Resolution state. */
  state: MoveState;
}

// ---------------------------------------------------------------------------
// Helper: scanner/arm filter check
// ---------------------------------------------------------------------------

function itemMatchesFilter(
  item: ItemInstance,
  filterProperty?: string,
  filterValue?: string,
): boolean {
  if (!filterProperty || !filterValue) return true;
  const itemDef = itemRegistry.getItem(item.defId);
  if (!itemDef) return false;
  return String(itemDef.properties[filterProperty] ?? '') === filterValue;
}

// ---------------------------------------------------------------------------
// Direction utilities
// ---------------------------------------------------------------------------

/**
 * The compass direction FROM which a mover at `sourceKey` arrives at `targetKey`.
 * E.g. source=(0,0), target=(1,0): source is west of target → Direction.W (3).
 * Coordinate convention: x increases East, y increases South. N=0,E=1,S=2,W=3.
 */
function arrivalDirection(sourceKey: string, targetKey: string): Direction {
  const [sx, sy] = sourceKey.split(',').map(Number);
  const [tx, ty] = targetKey.split(',').map(Number);
  const dx = sx - tx; // positive → source is east of target
  const dy = sy - ty; // positive → source is south of target
  if (dx === -1) return 3 as Direction; // source is west  → arrives from W
  if (dx ===  1) return 1 as Direction; // source is east  → arrives from E
  if (dy === -1) return 0 as Direction; // source is north → arrives from N
  if (dy ===  1) return 2 as Direction; // source is south → arrives from S
  return 0 as Direction;
}

/**
 * Clockwise priority for Round-Robin arbitration (lower = higher priority).
 * Cycles clockwise starting from `(lastDir + 1) % 4`.
 */
function cwPriority(arrivalDir: Direction, lastDir: Direction): number {
  const start = (lastDir + 1) % 4;
  return (arrivalDir - start + 4) % 4;
}

// ---------------------------------------------------------------------------
// Pre-phase: Item Spawning
// ---------------------------------------------------------------------------

function generateNewItems(world: WorldState): void {
  for (const [key, building] of world.buildings) {
    if (building.type !== 'emitter') continue;
    if (world.items.has(key)) continue; // already holding an item
    const staticObj = world.staticObjects.get(key);
    if (!staticObj || staticObj.type !== 'garbage' || staticObj.itemPool.length === 0) continue;
    const itemDefId = staticObj.itemPool[Math.floor(Math.random() * staticObj.itemPool.length)];
    world.items.set(key, {
      id: nextItemId(), defId: itemDefId,
      x: building.x, y: building.y,
      renderX: building.x, renderY: building.y, renderScale: 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Intent Generation
// ---------------------------------------------------------------------------

/** A proposal from one building about where one source cell's item should go. */
interface IntentProposal {
  priority: number; // higher priority → sorted earlier in the intents list
  intent: string;   // destination grid key
}

function generateIntents(world: WorldState): Ticket[] {
  const tickets: Ticket[] = [];

  // Collect per-source-cell proposals from all buildings in a single pass.
  const proposals = new Map<string, IntentProposal[]>();
  const addProposal = (sourceKey: string, priority: number, intent: string) => {
    let list = proposals.get(sourceKey);
    if (!list) { list = []; proposals.set(sourceKey, list); }
    list.push({ priority, intent });
  };

  for (const [key, building] of world.buildings) {
    const { dx, dy } = getDirectionOffset(building.direction);

    if (building.type === 'belt') {
      if (!world.items.has(key)) continue;
      const belt = building as Belt;
      addProposal(key, 0, gridKey(belt.x + dx, belt.y + dy));
    } else if (building.type === 'arm') {
      if (world.signals.get(key) !== true) continue; // must be powered
      const arm = building as Arm;
      const inputKey  = gridKey(arm.x + dx, arm.y + dy); // cell IN FRONT (claw side)
      const outputKey = gridKey(arm.x - dx, arm.y - dy); // cell BEHIND

      if (world.buildings.get(inputKey)?.type  !== 'belt') continue;
      if (world.buildings.get(outputKey)?.type !== 'belt') continue;
      if (!world.items.has(inputKey)) continue;

      // Higher priority than the belt's own forward intent, so the arm jump
      // is tried first; belt forward becomes the fallback.
      addProposal(inputKey, 1, outputKey);
    } else if (building.type === 'emitter') {
      if (!world.items.has(key)) continue;
      addProposal(key, 0, gridKey(building.x + dx, building.y + dy));
    }
  }

  // Build tickets from proposal groups (sort by priority descending → intent order).
  for (const [sourceKey, list] of proposals) {
    list.sort((a, b) => b.priority - a.priority);
    // Deduplicate intents (preserve order, drop later duplicates).
    const intents = list.map(p => p.intent).filter((v, i, arr) => arr.indexOf(v) === i);
    tickets.push({
      id: sourceKey,
      item: world.items.get(sourceKey)!,
      sourceKey,
      intents,
      intentIndex: 0,
      state: MoveState.UNRESOLVED,
    });
  }

  return tickets;
}

function canHoldItems(building?: Building): boolean {
  if (!building) return true;
  return building.type === 'belt' || building.type === 'receiver' || building.type === 'emitter';
}

// ---------------------------------------------------------------------------
// Phase 2: Iterative Resolution
// ---------------------------------------------------------------------------

function checkCanMove(
  ticket: Ticket,
  states: Map<string, MoveState>,
  ticketBySourceKey: Map<string, Ticket>,
  world: WorldState,
): boolean {
  const state = states.get(ticket.id)!;

  if (state === MoveState.LOCKED_MOVING) return true;
  if (state === MoveState.BLOCKED)       return false;
  if (state === MoveState.EVALUATING)    return true; // cycle detected → can move

  states.set(ticket.id, MoveState.EVALUATING);

  const targetKey = ticket.intents[ticket.intentIndex];
  const targetBuilding = world.buildings.get(targetKey);

  if (!canHoldItems(targetBuilding)) {
    states.set(ticket.id, MoveState.UNRESOLVED);
    return false;
  }

  if (targetBuilding?.type === 'receiver') {
    states.set(ticket.id, MoveState.UNRESOLVED);
    return true;
  }
  if (!world.items.has(targetKey)) {
    states.set(ticket.id, MoveState.UNRESOLVED);
    return true;
  }

  const blockingTicket = ticketBySourceKey.get(targetKey);
  if (!blockingTicket) {
    states.set(ticket.id, MoveState.UNRESOLVED);
    return false;
  }

  const canBlockerMove = checkCanMove(blockingTicket, states, ticketBySourceKey, world);
  states.set(ticket.id, MoveState.UNRESOLVED);
  return canBlockerMove;
}

function resolveIntents(tickets: Ticket[], world: WorldState): void {
  const ticketBySourceKey = new Map<string, Ticket>();
  for (const t of tickets) {
    ticketBySourceKey.set(t.sourceKey, t);
  }

  const states = new Map<string, MoveState>();
  for (const t of tickets) {
    states.set(t.id, MoveState.UNRESOLVED);
    t.state = MoveState.UNRESOLVED;
  }

  const getState = (t: Ticket) => states.get(t.id)!;
  const setState = (t: Ticket, s: MoveState) => { states.set(t.id, s); t.state = s; };

  let anyUnresolved = true;
  while (anyUnresolved) {
    anyUnresolved = false;

    // Gather proposals
    const proposals = new Map<string, Ticket[]>();
    for (const t of tickets) {
      if (getState(t) !== MoveState.UNRESOLVED) continue;
      if (t.intentIndex >= t.intents.length) {
        setState(t, MoveState.BLOCKED);
        continue;
      }
      const target = t.intents[t.intentIndex];
      if (!proposals.has(target)) proposals.set(target, []);
      proposals.get(target)!.push(t);
    }

    if (proposals.size === 0) break;

    // Arbitration
    for (const [targetKey, proposers] of proposals) {
      let winner: Ticket;

      if (proposers.length === 1) {
        winner = proposers[0];
      } else {
        const targetBuilding = world.buildings.get(targetKey);
        const lastDir: Direction =
          (targetBuilding as { lastInputIndex?: Direction } | undefined)?.lastInputIndex
          ?? (3 as Direction);

        let bestTicket: Ticket | null = null;
        let bestPriority = Infinity;

        for (const t of proposers) {
          const arrDir = arrivalDirection(t.sourceKey, targetKey);
          const priority = cwPriority(arrDir, lastDir);
          if (priority < bestPriority) {
            bestPriority = priority;
            bestTicket = t;
          }
        }

        winner = bestTicket!;

        for (const t of proposers) {
          if (t === winner) continue;
          t.intentIndex++;
          if (t.intentIndex >= t.intents.length) setState(t, MoveState.BLOCKED);
          anyUnresolved = true;
        }
      }

      if (getState(winner) !== MoveState.UNRESOLVED) continue;

      const canMove = checkCanMove(winner, states, ticketBySourceKey, world);
      if (canMove) {
        setState(winner, MoveState.LOCKED_MOVING);
        anyUnresolved = true;
      } else {
        winner.intentIndex++;
        if (winner.intentIndex >= winner.intents.length) setState(winner, MoveState.BLOCKED);
        anyUnresolved = true;
      }
    }
  }

  for (const t of tickets) {
    if (t.state === MoveState.UNRESOLVED || t.state === MoveState.EVALUATING) {
      t.state = MoveState.BLOCKED;
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Execution (double-buffer)
// ---------------------------------------------------------------------------

function executeTickets(tickets: Ticket[], world: WorldState): void {
  // Snapshot of the current items map — we read from this, write to nextItems
  const prevItems = new Map(world.items);

  // Next state: start with all BLOCKED items staying in place
  const nextItems = new Map<string, ItemInstance>();
  for (const t of tickets) {
    if (t.state === MoveState.BLOCKED) {
      nextItems.set(t.sourceKey, t.item);
    }
  }
  // Also keep items that have no ticket (items on non-building cells that
  // weren't involved in any ticket — shouldn't normally exist, but be safe)
  for (const [key, item] of prevItems) {
    if (!nextItems.has(key)) {
      // Check if any ticket covers this item
      const hasCoverage = tickets.some(t => t.item === item);
      if (!hasCoverage) nextItems.set(key, item);
    }
  }

  for (const ticket of tickets) {
    if (ticket.state !== MoveState.LOCKED_MOVING) continue;

    const targetKey = ticket.intents[ticket.intentIndex];
    const [tx, ty] = targetKey.split(',').map(Number);
    const targetBuilding = world.buildings.get(targetKey);

    if (!canHoldItems(targetBuilding)) {
      nextItems.set(ticket.sourceKey, ticket.item);
      continue;
    }

    // Receiver: consume the item
    const receiverTarget = targetBuilding as Receiver | undefined;
    if (receiverTarget?.type === 'receiver') {
      // Move item logically to the receiver cell so the dying animation
      // lerps from the input cell into the receiver cell before fading out.
      ticket.item.x = tx;
      ticket.item.y = ty;
      // Consume the item — do NOT place in nextItems
      scoreReceiver(world, receiverTarget, ticket.item);
      updateLastAccepted(world, targetKey, ticket.sourceKey);
      continue;
    }

    // Normal move: place at target (source is simply absent from nextItems)
    ticket.item.x = tx;
    ticket.item.y = ty;
    nextItems.set(targetKey, ticket.item);
    updateLastAccepted(world, targetKey, ticket.sourceKey);
  }

  // Swap buffer
  world.items = nextItems;
}

function scannerSignalMatches(world: WorldState, scanner: Scanner): boolean {
  const { dx, dy } = getDirectionOffset(scanner.direction);
  const scanKey = gridKey(scanner.x + dx, scanner.y + dy);
  const item = world.items.get(scanKey);
  if (!item) return false;
  return itemMatchesFilter(item, scanner.filterProperty, scanner.filterValue);
}

function propagateSignals(world: WorldState): void {
  world.signals.clear();

  const queue: string[] = [];
  const energizedWireCells = new Set<string>();

  for (const [, building] of world.buildings) {
    if (building.type !== 'scanner') continue;
    const scanner = building as Scanner;
    if (!scannerSignalMatches(world, scanner)) continue;
    const scannerKey = gridKey(scanner.x, scanner.y);
    if (world.wireCells.has(scannerKey)) {
      queue.push(scannerKey);
    }
  }

  for (const [key, building] of world.buildings) {
    if (building.type !== 'button') continue;
    const button = building as Button;
    if (!button.isOn) continue;
    if (world.wireCells.has(key)) {
      queue.push(key);
    }
  }

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (energizedWireCells.has(key) || !world.wireCells.has(key)) continue;
    energizedWireCells.add(key);

    const [x, y] = key.split(',').map(Number);
    const neighbors = [
      gridKey(x + 1, y),
      gridKey(x - 1, y),
      gridKey(x, y + 1),
      gridKey(x, y - 1),
    ];

    for (const neighborKey of neighbors) {
      if (world.wireCells.has(neighborKey) && !energizedWireCells.has(neighborKey)) {
        queue.push(neighborKey);
      }
    }
  }

  for (const [buildingKey] of world.buildings) {
    if (energizedWireCells.has(buildingKey)) {
      world.signals.set(buildingKey, true);
    }
  }
}

function scoreReceiver(
  world: WorldState,
  receiver: Receiver,
  item: ItemInstance,
): void {
  const itemDef = itemRegistry.getItem(item.defId);
  if (!itemDef) return;
  const request = receiver.request;

  let matches = true;
  for (const [prop, condition] of Object.entries(request.properties)) {
    const itemPropVal = String(itemDef.properties[prop] ?? '');
    if (!condition.includes(itemPropVal)) { 
      matches = false; 
      break; 
    }
  }
  
  if (matches) {
    world.playerMoney += request.cost;
  } else {
    world.playerMoney -= request.penalty;
  }
}

function updateLastAccepted(world: WorldState, targetKey: string, sourceKey: string): void {
  const b = world.buildings.get(targetKey);
  if (!b) return;
  (b as { lastInputIndex?: Direction }).lastInputIndex = arrivalDirection(sourceKey, targetKey);
}

// ---------------------------------------------------------------------------
// Building handlers (kept for legacy compat and receiver accept())
// ---------------------------------------------------------------------------

abstract class BuildingHandler<T extends Building> {
  abstract accept(world: WorldState, building: T, item: ItemInstance): boolean;
}

class ReceiverHandler extends BuildingHandler<Receiver> {
  accept(world: WorldState, receiver: Receiver, item: ItemInstance): boolean {
    scoreReceiver(world, receiver, item);
    return true;
  }
}

class BeltHandler extends BuildingHandler<Belt> {
  accept(world: WorldState, belt: Belt, item: ItemInstance): boolean {
    const key = gridKey(belt.x, belt.y);
    if (world.items.has(key)) return false;
    item.x = belt.x; item.y = belt.y;
    world.items.set(key, item);
    return true;
  }
}

const handlers = new Map<BuildingType, BuildingHandler<Building>>([
  ['emitter',  new (class extends BuildingHandler<Emitter> {
    accept() { return false; }
  })()],
  ['belt',     new BeltHandler()],
  ['receiver', new ReceiverHandler()],
  ['scanner',  new (class extends BuildingHandler<Scanner> {
    accept() { return false; }
  })()],
  ['arm',      new (class extends BuildingHandler<Arm> {
    accept() { return false; }
  })()],
  ['button',   new (class extends BuildingHandler<Button> {
    accept() { return false; }
  })()],
  ['lamp',     new (class extends BuildingHandler<Lamp> {
    accept() { return false; }
  })()],
]);

export function getHandler(type: BuildingType): BuildingHandler<Building> | undefined {
  return handlers.get(type);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function tickWorld(world: WorldState): void {
  world.tick++;
  propagateSignals(world);
  generateNewItems(world);
  const tickets = generateIntents(world);
  resolveIntents(tickets, world);
  executeTickets(tickets, world);
}

// ---------------------------------------------------------------------------
// Legacy exports (backward-compat)
// ---------------------------------------------------------------------------

export interface TickContext { movedItems: Set<string>; }

export function moveItem(
  world: WorldState,
  fromX: number, fromY: number,
  toX: number, toY: number,
  _ctx: TickContext,
): boolean {
  const fromKey = gridKey(fromX, fromY);
  const toKey   = gridKey(toX, toY);
  const item = world.items.get(fromKey);
  if (!item) return false;
  const targetBuilding = world.buildings.get(toKey);
  if (targetBuilding) {
    const handler = getHandler(targetBuilding.type);
    if (handler?.accept(world, targetBuilding as never, item)) {
      item.x = toX; item.y = toY;
      world.items.delete(fromKey);
      return true;
    }
    return false;
  }
  if (world.items.has(toKey)) return false;
  world.items.delete(fromKey);
  item.x = toX; item.y = toY;
  world.items.set(toKey, item);
  return true;
}

export function evaluateRoundRobinSources(
  _world: WorldState,
  _receiverKey: string,
  _sources: string[],
  lastInputIndex: number | undefined,
  _beltMap: Map<Belt, Belt>,
  _evaluateBelt: (belt: Belt) => void,
): number | undefined {
  return lastInputIndex;
}
