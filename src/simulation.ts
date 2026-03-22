/**
 * simulation.ts — tick algorithm
 *
 * Pre-phase: Item Spawning (generateNewItems)
 *   Emitters with a non-empty item pool and no item on their cell spawn a new
 *   real item at the emitter cell.  The item then participates in phases 1-3
 *   like any other item.
 *
 * Phase 1: Intent Generation (generateMoveProposals → buildTickets)
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
  Painter,
  Button,
  Lamp,
  Splitter,
  Merger,
} from './types.ts';
import { MoveState } from './types.ts';
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
  return String(getEffectiveItemProperty(item, filterProperty) ?? '') === filterValue;
}

function getEffectiveItemProperty(item: ItemInstance, property: string): string | undefined {
  if (property === 'shape') return item.shape;
  if (property === 'color') return item.color;
  if (property === 'size') return item.size;
  return undefined;
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
    const handler = handlers.get(building.type);
    handler?.spawnItem(world, building, key);
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Intent Generation
// ---------------------------------------------------------------------------

/** A raw move proposal emitted by a building handler. */
export interface MoveProposal {
  sourceKey: string; // grid key of the item's current cell
  priority: number;  // higher priority → sorted earlier in the intents list
  intent: string;    // destination grid key
}

function generateMoveProposals(world: WorldState): MoveProposal[] {
  return Array.from(world.buildings.entries())
    .flatMap(([key, building]) => 
      handlers.get(building.type)?.generateIntents(world, building, key) ?? []
  );
}

function buildTickets(proposals: MoveProposal[], world: WorldState): Ticket[] {
  // Group proposals by sourceKey, sort by priority descending, deduplicate intents.
  const grouped = new Map<string, MoveProposal[]>();
  for (const p of proposals) {
    let list = grouped.get(p.sourceKey);
    if (!list) { list = []; grouped.set(p.sourceKey, list); }
    list.push(p);
  }

  const tickets: Ticket[] = [];
  for (const [sourceKey, list] of grouped) {
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

function canHoldItems(building: Building | undefined, world: WorldState, targetKey: string): boolean {
  if (world.buildingSecondary.has(targetKey)) {
    // Secondary cell: allow items for splitter (input) or merger (input)
    const anchorKey = world.buildingSecondary.get(targetKey)!;
    const anchorType = world.buildings.get(anchorKey)?.type;
    return anchorType === 'splitter' || anchorType === 'merger';
  }
  if (!building) return true;
  // Merger anchor cell acts as an input buffer
  if (building.type === 'merger') return true;
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

  if (!canHoldItems(targetBuilding, world, targetKey)) {
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

    if (!canHoldItems(targetBuilding, world, targetKey)) {
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

    // Update splitter round-robin state
    // sourceKey is the secondary (input) cell — look up the anchor via buildingSecondary
    const sourceAnchorKey = world.buildingSecondary.get(ticket.sourceKey) ?? ticket.sourceKey;
    const sourceBuilding = world.buildings.get(sourceAnchorKey);
    if (sourceBuilding?.type === 'splitter') {
      const splitter = sourceBuilding as Splitter;
      const { dx, dy } = getDirectionOffset(splitter.direction);
      const output1Key = gridKey(splitter.x + dx, splitter.y + dy);
      splitter.lastOutputSide = targetKey === output1Key ? 0 : 1;
    } else if (sourceBuilding?.type === 'merger') {
      const merger = sourceBuilding as Merger;
      // 0 = input1 (anchor) was last used, 1 = input2 (secondary) was last used
      merger.lastInputSide = ticket.sourceKey === gridKey(merger.x, merger.y) ? 0 : 1;
    }
  }

  // Swap buffer
  world.items = nextItems;
}

function propagateSignals(world: WorldState): void {
  world.signals.clear();

  const queue: string[] = [];
  const energizedWireCells = new Set<string>();

  for (const [key, building] of world.buildings) {
    const handler = handlers.get(building.type);
    if (handler?.emitsSignal(world, building) && world.wireCells.has(key)) {
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
  const request = receiver.request;

  let matches = true;
  for (const [prop, condition] of Object.entries(request.properties)) {
    const itemPropVal = String(getEffectiveItemProperty(item, prop) ?? '');
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
// Building handlers
// ---------------------------------------------------------------------------

export abstract class BuildingHandler<T extends Building> {
  abstract accept(world: WorldState, building: T, item: ItemInstance): boolean;

  generateIntents(_world: WorldState, _building: T, _key: string): MoveProposal[] {
    return [];
  }

  spawnItem(_world: WorldState, _building: T, _key: string): void {
    // default: no spawning
  }

  emitsSignal(_world: WorldState, _building: T): boolean {
    return false;
  }

  applyEffects(_world: WorldState, _building: T, _key: string): void {
    // default: no side-effects
  }
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

  generateIntents(world: WorldState, belt: Belt, key: string): MoveProposal[] {
    if (!world.items.has(key)) return [];
    const { dx, dy } = getDirectionOffset(belt.direction);
    return [{ sourceKey: key, priority: 0, intent: gridKey(belt.x + dx, belt.y + dy) }];
  }
}

class ArmHandler extends BuildingHandler<Arm> {
  accept() { return false; }

  generateIntents(world: WorldState, arm: Arm, key: string): MoveProposal[] {
    if (world.signals.get(key) !== true) return []; // must be powered
    const { dx, dy } = getDirectionOffset(arm.direction);
    const inputKey  = gridKey(arm.x + dx, arm.y + dy); // cell IN FRONT (claw side)
    const outputKey = gridKey(arm.x - dx, arm.y - dy); // cell BEHIND

    if (world.buildings.get(inputKey)?.type  !== 'belt') return [];
    if (world.buildings.get(outputKey)?.type !== 'belt') return [];
    if (!world.items.has(inputKey)) return [];

    // Higher priority than the belt's own forward intent, so the arm jump
    // is tried first; belt forward becomes the fallback.
    return [{ sourceKey: inputKey, priority: 1, intent: outputKey }];
  }
}

class EmitterHandler extends BuildingHandler<Emitter> {
  accept() { return false; }

  generateIntents(world: WorldState, emitter: Emitter, key: string): MoveProposal[] {
    if (!world.items.has(key)) return [];
    const { dx, dy } = getDirectionOffset(emitter.direction);
    return [{ sourceKey: key, priority: 0, intent: gridKey(emitter.x + dx, emitter.y + dy) }];
  }

  spawnItem(world: WorldState, emitter: Emitter, key: string): void {
    if (world.items.has(key)) return; // already holding an item
    if (emitter.sequence.length === 0) return;

    if (!emitter.loop && emitter.nextSequenceIndex >= emitter.sequence.length) return;

    const index = emitter.nextSequenceIndex % emitter.sequence.length;
    const seqItem = emitter.sequence[index];
    emitter.nextSequenceIndex = emitter.loop
      ? (index + 1) % emitter.sequence.length
      : index + 1;

    world.items.set(key, {
      id: nextItemId(),
      shape: seqItem.shape,
      color: seqItem.color,
      size: seqItem.size,
      x: emitter.x, y: emitter.y,
      renderX: emitter.x, renderY: emitter.y, renderScale: 0,
    });
  }
}

class ScannerHandler extends BuildingHandler<Scanner> {
  accept() { return false; }

  emitsSignal(world: WorldState, scanner: Scanner): boolean {
    const { dx, dy } = getDirectionOffset(scanner.direction);
    const scanKey = gridKey(scanner.x + dx, scanner.y + dy);
    const item = world.items.get(scanKey);
    if (!item) return false;
    return itemMatchesFilter(item, scanner.filterProperty, scanner.filterValue);
  }
}

class ButtonHandler extends BuildingHandler<Button> {
  accept() { return false; }

  emitsSignal(_world: WorldState, button: Button): boolean {
    return button.isOn;
  }
}

class PainterHandler extends BuildingHandler<Painter> {
  accept() { return false; }

  applyEffects(world: WorldState, painter: Painter, key: string): void {
    if (world.signals.get(key) !== true) return;
    const { dx, dy } = getDirectionOffset(painter.direction);
    const inputKey = gridKey(painter.x + dx, painter.y + dy);
    const item = world.items.get(inputKey);
    if (item) {
      item.color = painter.paintColor;
    }
  }
}

class SplitterHandler extends BuildingHandler<Splitter> {
  accept() { return false; }

  generateIntents(world: WorldState, splitter: Splitter, _key: string): MoveProposal[] {
    const { dx, dy } = getDirectionOffset(splitter.direction);
    // Input arrives at the secondary cell (perpendicular-right of anchor)
    const inputKey = gridKey(splitter.x - dy, splitter.y + dx);
    if (!world.items.has(inputKey)) return [];
    // output1: ahead of anchor cell
    const output1Key = gridKey(splitter.x + dx,       splitter.y + dy);
    // output2: ahead of secondary cell
    const output2Key = gridKey(splitter.x + dx - dy,  splitter.y + dy + dx);
    // Round-robin: prefer the output NOT used last
    const preferOutput1 = splitter.lastOutputSide !== 0;
    const primary   = preferOutput1 ? output1Key : output2Key;
    const secondary = preferOutput1 ? output2Key : output1Key;
    return [
      { sourceKey: inputKey, priority: 1, intent: primary },
      { sourceKey: inputKey, priority: 0, intent: secondary },
    ];
  }
}

class MergerHandler extends BuildingHandler<Merger> {
  accept() { return false; }

  generateIntents(world: WorldState, merger: Merger, _key: string): MoveProposal[] {
    const { dx, dy } = getDirectionOffset(merger.direction);
    // input1: anchor cell
    const input1Key = gridKey(merger.x, merger.y);
    // input2: secondary cell (perpendicular-right of anchor)
    const input2Key = gridKey(merger.x - dy, merger.y + dx);
    // output: ahead of secondary cell
    const outputKey = gridKey(merger.x + dx - dy, merger.y + dy + dx);

    const has1 = world.items.has(input1Key);
    const has2 = world.items.has(input2Key);
    if (!has1 && !has2) return [];

    // Round-robin: prefer the input NOT used last; fall back to the other if preferred is empty
    const preferInput1 = merger.lastInputSide !== 0;
    const preferredKey  = preferInput1 ? input1Key : input2Key;
    const fallbackKey   = preferInput1 ? input2Key : input1Key;
    const hasPreferred  = preferInput1 ? has1 : has2;
    const hasFallback   = preferInput1 ? has2 : has1;

    const sourceKey = hasPreferred ? preferredKey : (hasFallback ? fallbackKey : null);
    if (!sourceKey) return [];
    return [{ sourceKey, priority: 0, intent: outputKey }];
  }
}

const handlers = new Map<BuildingType, BuildingHandler<Building>>([
  ['emitter',  new EmitterHandler()],
  ['belt',     new BeltHandler()],
  ['receiver', new ReceiverHandler()],
  ['scanner',  new ScannerHandler()],
  ['arm',      new ArmHandler()],
  ['painter',  new PainterHandler()],
  ['button',   new ButtonHandler()],
  ['splitter', new SplitterHandler()],
  ['merger',   new MergerHandler()],
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

function applyBuildingEffects(world: WorldState): void {
  for (const [key, building] of world.buildings) {
    const handler = handlers.get(building.type);
    handler?.applyEffects(world, building as never, key);
  }
}

export function tickWorld(world: WorldState): void {
  world.tick++;
  propagateSignals(world);
  generateNewItems(world);
  const tickets = buildTickets(generateMoveProposals(world), world);
  resolveIntents(tickets, world);
  applyBuildingEffects(world);
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
