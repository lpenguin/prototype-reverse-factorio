/**
 * simulation.ts — 3-phase tick algorithm
 *
 * Phase 1: Intent Generation
 *   Every item (including virtual emitter items) declares an ordered list of
 *   desired destination cells ("intents").
 *
 *   - Item on a Belt:  intents = [belt_forward]
 *     Special case: if a Sorter claims this cell as its input cell AND the
 *     item matches the sorter's filter, prepend the sorter cell as primary
 *     intent (overflow = original belt_forward direction).  If the item does
 *     NOT match, and the belt happens to point into the sorter cell, redirect
 *     the intent to the sorter's output (skip the sorter cell).
 *   - Item on a Sorter cell: intents = [sorter_output]
 *   - Item on a bare cell claimed by a Sorter's input: if item matches, the
 *     sorter generates a ticket on behalf of that item: intents = [sorterKey].
 *   - Virtual Emitter item: intents = [emitter_forward]
 *
 * Phase 2: Iterative Resolution
 *   Proposals are gathered, merge conflicts resolved by Round-Robin (clockwise
 *   from last accepted direction), and DFS cycle detection unlocks circular
 *   moving loops.  Losers / blocked items try their next intent (Overflow).
 *
 * Phase 3: Execution (double-buffer)
 *   A new nextItems map is built.  LOCKED_MOVING items are placed in nextItems
 *   at their target; BLOCKED items are kept at their current cell.
 *   Emitter virtuals spawn new real items; receivers consume arriving items.
 *   Round-robin state is updated, then world.items = nextItems.
 */

import type {
  WorldState,
  Building,
  BuildingType,
  ItemInstance,
  Direction,
  Sorter,
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
  /** Stable key.  Real items: "x,y".  Virtual emitters: "emitter:x,y".  Sorter-pull: "pull:x,y". */
  id: string;
  /** Null for virtual emitter tickets. */
  item: ItemInstance | null;
  /** Source cell key (where the item currently is). */
  sourceKey: string;
  /** For virtual emitter tickets: emitter building key. */
  emitterKey?: string;
  /** Ordered list of candidate destination grid-keys. */
  intents: string[];
  /** Index into `intents` currently being tried. */
  intentIndex: number;
  /** Resolution state. */
  state: MoveState;
}

// ---------------------------------------------------------------------------
// Helper: sorter filter check (exported for tests)
// ---------------------------------------------------------------------------

export function itemMatchesFilter(
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
// Phase 1: Intent Generation
// ---------------------------------------------------------------------------

function generateIntents(world: WorldState): Ticket[] {
  const tickets: Ticket[] = [];
  // sourceKey → ticket for real item-driven tickets (for sorter intent injection)
  const ticketBySourceKey = new Map<string, Ticket>();

  // --- Pass 1: base tickets for items on buildings ---

  for (const [key, building] of world.buildings) {
    if (building.type === 'emitter') {
      const staticObj = world.staticObjects.get(key);
      if (!staticObj || staticObj.type !== 'garbage' || staticObj.itemPool.length === 0) continue;
      const { dx, dy } = getDirectionOffset(building.direction);
      const targetKey = gridKey(building.x + dx, building.y + dy);
      tickets.push({
        id: `emitter:${key}`,
        item: null,
        sourceKey: key,
        emitterKey: key,
        intents: [targetKey],
        intentIndex: 0,
        state: MoveState.UNRESOLVED,
      });
      continue;
    }

    const item = world.items.get(key);
    if (!item) continue;

    if (building.type === 'belt') {
      const belt = building as Belt;
      const { dx, dy } = getDirectionOffset(belt.direction);
      const fwdKey = gridKey(belt.x + dx, belt.y + dy);
      const ticket: Ticket = {
        id: key,
        item,
        sourceKey: key,
        intents: [fwdKey],
        intentIndex: 0,
        state: MoveState.UNRESOLVED,
      };
      tickets.push(ticket);
      ticketBySourceKey.set(key, ticket);
    } else if (building.type === 'sorter') {
      const sorter = building as Sorter;
      const { dx, dy } = getDirectionOffset(sorter.direction);
      const outKey = gridKey(sorter.x + dx, sorter.y + dy);
      const ticket: Ticket = {
        id: key,
        item,
        sourceKey: key,
        intents: [outKey],
        intentIndex: 0,
        state: MoveState.UNRESOLVED,
      };
      tickets.push(ticket);
      ticketBySourceKey.set(key, ticket);
    } else if (building.type === 'arm') {
      // Handled in Pass 2 alongside signal check.
    }
  }

  // --- Pass 2: sorter intent injection, then arm intent injection ---

  for (const [, building] of world.buildings) {
    if (building.type !== 'sorter') continue;
    const sorter = building as Sorter;

    const { dx, dy } = getDirectionOffset(sorter.direction);
    const inputKey  = gridKey(sorter.x - dx, sorter.y - dy);
    const sorterKey = gridKey(sorter.x, sorter.y);
    const sorterOutKey = gridKey(sorter.x + dx, sorter.y + dy);

    const item = world.items.get(inputKey);
    if (!item) continue;

    const matches = itemMatchesFilter(item, sorter.filterProperty, sorter.filterValue);
    const existingTicket = ticketBySourceKey.get(inputKey);

    if (matches) {
      if (existingTicket) {
        // Inject sorter cell as primary intent, keep current intent as overflow
        if (existingTicket.intents[0] === sorterKey) {
          // Belt already points at sorter: add overflow = sorter's output
          existingTicket.intents = [sorterKey, sorterOutKey];
        } else {
          // Side-pull: sorter is perpendicular — inject sorter as top priority
          existingTicket.intents = [sorterKey, ...existingTicket.intents];
        }
      } else {
        // No belt ticket — sorter generates a pull ticket for this item
        const pullTicket: Ticket = {
          id: `pull:${inputKey}`,
          item,
          sourceKey: inputKey,
          intents: [sorterKey],
          intentIndex: 0,
          state: MoveState.UNRESOLVED,
        };
        tickets.push(pullTicket);
        ticketBySourceKey.set(inputKey, pullTicket);
      }
    } else {
      // Item does NOT match.
      if (existingTicket && existingTicket.intents[0] === sorterKey) {
        // Belt points into the sorter but item doesn't match → redirect past it
        existingTicket.intents = [sorterOutKey];
      }
      // If no existing ticket or belt doesn't point at sorter, leave as-is.
    }
  }

  // --- Pass 2b: arm intent injection ---
  //
  // A powered arm grabs the item at its inputKey and jumps it directly to
  // outputKey, bypassing normal belt flow. We either override an existing
  // ticket for the input cell or create a new pull ticket.

  for (const [armKey, building] of world.buildings) {
    if (building.type !== 'arm') continue;
    if (world.signals.get(armKey) !== true) continue; // must be powered

    const arm = building as Arm;
    const { dx, dy } = getDirectionOffset(arm.direction);
    const inputKey  = gridKey(arm.x + dx, arm.y + dy);   // cell IN FRONT of the arm (claw side)
    const outputKey = gridKey(arm.x - dx, arm.y - dy);   // cell BEHIND the arm

    const inputBuilding  = world.buildings.get(inputKey);
    const outputBuilding = world.buildings.get(outputKey);
    if (inputBuilding?.type !== 'belt')  continue;
    if (outputBuilding?.type !== 'belt') continue;

    const item = world.items.get(inputKey);
    if (!item) continue;

    // Compute the belt's own forward key so we can use it as a fallback intent.
    // If the arm jump is blocked (output occupied), the item falls back to
    // normal belt movement instead of freezing at the input cell.
    const inputBelt = world.buildings.get(inputKey) as Belt;
    const { dx: bdx, dy: bdy } = getDirectionOffset(inputBelt.direction);
    const beltFwdKey = gridKey(inputBelt.x + bdx, inputBelt.y + bdy);

    const existingTicket = ticketBySourceKey.get(inputKey);
    if (existingTicket) {
      // Jump to outputKey first; fall back to normal belt movement if blocked.
      existingTicket.intents = [outputKey, beltFwdKey];
      existingTicket.intentIndex = 0;
    } else {
      const armTicket: Ticket = {
        id: inputKey,
        item,
        sourceKey: inputKey,
        intents: [outputKey, beltFwdKey],
        intentIndex: 0,
        state: MoveState.UNRESOLVED,
      };
      tickets.push(armTicket);
      ticketBySourceKey.set(inputKey, armTicket);
    }
  }

  return tickets;
}

function canHoldItems(building?: Building): boolean {
  if (!building) return true;
  return building.type === 'belt' || building.type === 'sorter' || building.type === 'receiver';
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
    if (t.item) ticketBySourceKey.set(t.sourceKey, t);
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
    if (t.item && t.state === MoveState.BLOCKED) {
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
      if (ticket.item) {
        nextItems.set(ticket.sourceKey, ticket.item);
      }
      continue;
    }

    // Virtual emitter: spawn a new item
    if (ticket.item === null) {
      const emitterKey = ticket.emitterKey!;
      const staticObj = world.staticObjects.get(emitterKey);
      if (!staticObj || staticObj.itemPool.length === 0) continue;

      const itemDefId = staticObj.itemPool[Math.floor(Math.random() * staticObj.itemPool.length)];
      const [ex, ey] = emitterKey.split(',').map(Number);

      const receiverTarget = targetBuilding as Receiver | undefined;
      if (receiverTarget?.type === 'receiver') {
      // Spawned directly into a receiver — score it; item visually travels emitter → receiver
      scoreReceiver(world, receiverTarget, {
        id: nextItemId(), defId: itemDefId, x: tx, y: ty, renderX: ex, renderY: ey, renderScale: 0,
      });
      } else {
        // Item appears at emitter cell (renderX/Y) and lerps to output cell (x/y)
        nextItems.set(targetKey, { id: nextItemId(), defId: itemDefId, x: tx, y: ty, renderX: ex, renderY: ey, renderScale: 0 });
      }
      updateLastAccepted(world, targetKey, emitterKey);
      continue;
    }

    // Real item
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

class SorterHandler extends BuildingHandler<Sorter> {
  accept(world: WorldState, sorter: Sorter, item: ItemInstance): boolean {
    const key = gridKey(sorter.x, sorter.y);
    if (world.items.has(key)) return false;
    if (!itemMatchesFilter(item, sorter.filterProperty, sorter.filterValue)) return false;
    item.x = sorter.x; item.y = sorter.y;
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
  ['sorter',   new SorterHandler()],
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
  const tickets = generateIntents(world);
  resolveIntents(tickets, world);
  executeTickets(tickets, world);
}

// ---------------------------------------------------------------------------
// Legacy exports (backward-compat)
// ---------------------------------------------------------------------------

export const sorterHandler = {
  itemMatchesFilter: (
    item: ItemInstance,
    sorter: { filterProperty?: string; filterValue?: string },
  ) => itemMatchesFilter(item, sorter.filterProperty, sorter.filterValue),
};

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
