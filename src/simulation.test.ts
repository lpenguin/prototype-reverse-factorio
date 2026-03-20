import { describe, it, expect } from 'vitest';
import { Direction, type Receiver } from './types.ts';
import { createWorld, placeBuilding, addItem, gridKey } from './world.ts';
import { tickWorld, sorterHandler } from './simulation.ts';
import { requestRegistry } from './registry.ts';

// Helper to create a receiver with a request
function createTestReceiver(x: number, y: number, dir: Direction): Receiver {
  return {
    type: 'receiver',
    x, y,
    direction: dir,
    request: requestRegistry.getDefaultRequest()
  };
}

describe('Simulation Logic', () => {
  it('should move items across a belt chain in a single tick in sink-to-source order', () => {
    const world = createWorld();
    
    // Belt chain: B1 (1,0) -> B2 (2,0) -> B3 (3,0)
    placeBuilding(world, { type: 'belt', x: 1, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt', x: 2, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt', x: 3, y: 0, direction: Direction.E });
    // Receiver at (4, 0) fed by B3
    placeBuilding(world, createTestReceiver(4, 0, Direction.E));

    // Item at B1 (1,0)
    addItem(world, { defId: 'iron', x: 1, y: 0, renderX: 1, renderY: 0, renderScale: 0 });
    // Item at B2 (2,0)
    addItem(world, { defId: 'iron', x: 2, y: 0, renderX: 2, renderY: 0, renderScale: 0 });

    // Initial state check
    expect(world.items.has(gridKey(1, 0))).toBe(true);
    expect(world.items.has(gridKey(2, 0))).toBe(true);
    expect(world.items.has(gridKey(3, 0))).toBe(false);

    tickWorld(world);

    // After tickWorld:
    // With sink-to-source order:
    // 1. B3 (3,0) ticks. Empty, does nothing.
    // 2. B2 (2,0) ticks. Moves item to B3 (3,0).
    // 3. B1 (1,0) ticks. Moves item to B2 (2,0).
    
    expect(world.items.has(gridKey(3, 0))).toBe(true);
    expect(world.items.has(gridKey(2, 0))).toBe(true);
    expect(world.items.has(gridKey(1, 0))).toBe(false);
  });

  it('should allow multiple items to move forward in the same chain including into a receiver', () => {
    const world = createWorld();
    
    // Belt chain: (1,0) -> (2,0) -> (3,0) -> (4,0) (Receiver)
    placeBuilding(world, { type: 'belt', x: 1, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt', x: 2, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt', x: 3, y: 0, direction: Direction.E });
    placeBuilding(world, createTestReceiver(4, 0, Direction.E));

    addItem(world, { defId: 'item1', x: 1, y: 0, renderX: 1, renderY: 0, renderScale: 0 });
    addItem(world, { defId: 'item2', x: 2, y: 0, renderX: 2, renderY: 0, renderScale: 0 });
    addItem(world, { defId: 'item3', x: 3, y: 0, renderX: 3, renderY: 0, renderScale: 0 });

    tickWorld(world);

    // B3 moves item3 to receiver (4,0) -> item3 consumed
    // B2 moves item2 to B3 (3,0)
    // B1 moves item1 to B2 (2,0)

    expect(world.items.has(gridKey(1, 0))).toBe(false);
    expect(world.items.has(gridKey(2, 0))).toBe(true);
    expect(world.items.has(gridKey(3, 0))).toBe(true);
    expect(world.items.has(gridKey(4, 0))).toBe(false); // Consumed
    
    expect(world.items.get(gridKey(2, 0))?.defId).toBe('item1');
    expect(world.items.get(gridKey(3, 0))?.defId).toBe('item2');
  });

  it('should process multiple inputs in round-robin and not count empty belts', () => {
    const world = createWorld();
    
    // Merge: B1 (0,0) -> B3 (1,0), B2 (1,1) -> B3 (1,0)
    placeBuilding(world, { type: 'belt', x: 0, y: 0, direction: Direction.E }); // B1 (index 0)
    placeBuilding(world, { type: 'belt', x: 1, y: 1, direction: Direction.N }); // B2 (index 1)
    placeBuilding(world, { type: 'belt', x: 1, y: 0, direction: Direction.E }); // B3
    placeBuilding(world, createTestReceiver(2, 0, Direction.E));

    // Tick 1: B1 has item, B2 is empty
    addItem(world, { defId: 'itemA1', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 0 });
    
    tickWorld(world);
    // B1 moves to B3. lastInputIndex becomes 0.
    expect(world.items.get(gridKey(1, 0))?.defId).toBe('itemA1');
    expect(world.items.has(gridKey(0, 0))).toBe(false);

    // Tick 2: B1 has item, B2 has item. B3 is empty (itemA1 moved to receiver)
    addItem(world, { defId: 'itemA2', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 0 });
    addItem(world, { defId: 'itemB1', x: 1, y: 1, renderX: 1, renderY: 1, renderScale: 0 });

    tickWorld(world);
    // lastInputIndex was 0. Next start index is (0+1)%2 = 1 (B2).
    // B2 should move.
    expect(world.items.get(gridKey(1, 0))?.defId).toBe('itemB1');
    expect(world.items.get(gridKey(0, 0))?.defId).toBe('itemA2');
    expect(world.items.has(gridKey(1, 1))).toBe(false);

    // Tick 3: B3 empty. B1 has itemA2. B2 gets new itemB2.
    addItem(world, { defId: 'itemB2', x: 1, y: 1, renderX: 1, renderY: 1, renderScale: 0 });
    
    tickWorld(world);
    // lastInputIndex was 1. Next start index is (1+1)%2 = 0 (B1).
    // B1 should move.
    expect(world.items.get(gridKey(1, 0))?.defId).toBe('itemA2');
    expect(world.items.get(gridKey(1, 1))?.defId).toBe('itemB2');
    expect(world.items.has(gridKey(0, 0))).toBe(false);
  });
});

describe('Sorter Simulation', () => {
  it('should pass a matching item from input cell to sorter cell', () => {
    const world = createWorld();

    // Belt at (0,0) facing E → sorter at (1,0) facing E → belt at (2,0)
    placeBuilding(world, { type: 'belt',   x: 0, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'sorter', x: 1, y: 0, direction: Direction.E, filterProperty: 'color', filterValue: 'red' });
    placeBuilding(world, { type: 'belt',   x: 2, y: 0, direction: Direction.E });

    // Place a red item on the input cell (0,0)
    addItem(world, { defId: 'small-red-square', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 0 });

    tickWorld(world);

    // The belt at (0,0) ticks but can't push into sorter's output side;
    // the sorter ticks: its input cell (0,0) has a red item → pull it onto (1,0)
    expect(world.items.has(gridKey(1, 0))).toBe(true);
    expect(world.items.get(gridKey(1, 0))?.defId).toBe('small-red-square');
    expect(world.items.has(gridKey(0, 0))).toBe(false);
  });

  it('should not pull a non-matching item from the input cell', () => {
    const world = createWorld();

    placeBuilding(world, { type: 'sorter', x: 1, y: 0, direction: Direction.E, filterProperty: 'color', filterValue: 'red' });

    // Place a BLUE item directly on the input cell
    addItem(world, { defId: 'large-blue-circle', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 0 });

    tickWorld(world);

    // Sorter must not pull the blue item
    expect(world.items.has(gridKey(0, 0))).toBe(true);
    expect(world.items.has(gridKey(1, 0))).toBe(false);
  });

  it('should forward an item from the sorter cell to the output cell', () => {
    const world = createWorld();

    placeBuilding(world, { type: 'sorter', x: 1, y: 0, direction: Direction.E, filterProperty: 'color', filterValue: 'red' });
    placeBuilding(world, { type: 'belt',   x: 2, y: 0, direction: Direction.E });

    // Item already sitting ON the sorter cell
    addItem(world, { defId: 'small-red-square', x: 1, y: 0, renderX: 1, renderY: 0, renderScale: 0 });

    tickWorld(world);

    // Sorter pushes the item to the belt at (2,0)
    expect(world.items.has(gridKey(1, 0))).toBe(false);
    expect(world.items.has(gridKey(2, 0))).toBe(true);
    expect(world.items.get(gridKey(2, 0))?.defId).toBe('small-red-square');
  });

  it('should pass all items when no filter is configured', () => {
    const world = createWorld();

    placeBuilding(world, { type: 'sorter', x: 1, y: 0, direction: Direction.E });

    addItem(world, { defId: 'large-blue-circle', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 0 });

    tickWorld(world);

    // No filter → accept any item
    expect(world.items.has(gridKey(1, 0))).toBe(true);
    expect(world.items.get(gridKey(1, 0))?.defId).toBe('large-blue-circle');
  });

  it('itemMatchesFilter returns true for matching item and false otherwise', () => {
    const redItem =  { defId: 'small-red-square',      x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 0 };
    const blueItem = { defId: 'large-blue-circle',     x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 0 };
    const sorterRed = { type: 'sorter' as const, x: 1, y: 0, direction: Direction.E, filterProperty: 'color', filterValue: 'red' };

    expect(sorterHandler.itemMatchesFilter(redItem,  sorterRed)).toBe(true);
    expect(sorterHandler.itemMatchesFilter(blueItem, sorterRed)).toBe(false);
  });

  it('should perform round-robin across two belts feeding into the sorter input cell', () => {
    const world = createWorld();

    // Two belts merge onto (1,1), which is the input cell of the sorter at (2,1) facing E.
    // Belt A: (0,1) facing E → feeds (1,1)
    // Belt B: (1,2) facing N → feeds (1,1)  [grid key "1,1"]
    // But (1,1) itself is empty space — the sorter reads directly from its input cell.
    // So we place items at (0,1) and (1,2) to simulate two filled upstream belts.
    placeBuilding(world, { type: 'belt',   x: 0, y: 1, direction: Direction.E });
    placeBuilding(world, { type: 'belt',   x: 1, y: 2, direction: Direction.N });
    // Belt at the sorter's input cell isn't strictly required for this test —
    // we'll place items there directly and verify the sorter picks one per tick.
    placeBuilding(world, { type: 'sorter', x: 2, y: 1, direction: Direction.E, filterProperty: 'color', filterValue: 'red' });

    // Tick 1: only one red item at sorter's input cell (1,1)
    addItem(world, { defId: 'small-red-square', x: 1, y: 1, renderX: 1, renderY: 1, renderScale: 0 });

    tickWorld(world);

    // Sorter pulls it in
    expect(world.items.has(gridKey(2, 1))).toBe(true);
    expect(world.items.get(gridKey(2, 1))?.defId).toBe('small-red-square');
  });
});

describe('Sorter with downstream Receiver (regression)', () => {
  // Reproduces the bug: a sorter connected to a belt line that has a receiver
  // at the end was never receiving items because the belt-phase DFS (triggered
  // by the receiver-sink) was draining the sorter's input belt before the
  // sorter phase had a chance to pull from it.
  //
  // Sorter layout used throughout:
  //   [B0(0,0)] → [B1(1,0)] → [B2(2,0)] → [Receiver(3,0)]
  //                    ↑ sorter input cell
  //               [Sorter(1,1) facing S] → output=(1,2)
  //
  // Direction.S: {dx:0, dy:+1} → output=(x, y+1), input=(x, y-1)
  // Sorter at (1,1) facing S: output=(1,2), input=(1,0)=B1. ✓
  //
  // Direction.S = 2 in our types.

  it('sorter receives matching items even when a receiver is at the end of the belt line', () => {
    const world = createWorld();

    placeBuilding(world, { type: 'belt',     x: 0, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt',     x: 1, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt',     x: 2, y: 0, direction: Direction.E });
    placeBuilding(world, createTestReceiver(3, 0, Direction.E));
    // Sorter at (1,1) facing S: input=(1,0)=B1, output=(1,2)
    placeBuilding(world, { type: 'sorter',   x: 1, y: 1, direction: Direction.S,
      filterProperty: 'color', filterValue: 'red' });

    // Place a matching red item directly on B1 (1,0) — the sorter's input cell
    addItem(world, { defId: 'small-red-square', x: 1, y: 0, renderX: 1, renderY: 0, renderScale: 0 });

    tickWorld(world);

    // The sorter must pull the red item from (1,0) onto itself (1,1).
    // Before the fix, the belt-phase DFS would drain (1,0) via the receiver-sink
    // chain before the sorter phase ever ran.
    expect(world.items.has(gridKey(1, 1))).toBe(true);
    expect(world.items.get(gridKey(1, 1))?.defId).toBe('small-red-square');
    expect(world.items.has(gridKey(1, 0))).toBe(false);
  });

  it('non-matching items on the sorter input belt are not pulled and continue down the main line', () => {
    const world = createWorld();

    placeBuilding(world, { type: 'belt',     x: 0, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt',     x: 1, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt',     x: 2, y: 0, direction: Direction.E });
    placeBuilding(world, createTestReceiver(3, 0, Direction.E));
    placeBuilding(world, { type: 'sorter',   x: 1, y: 1, direction: Direction.S,
      filterProperty: 'color', filterValue: 'red' });

    // Blue item at B0 (0,0) — will be pushed to B1 (1,0) by B0's tick.
    // The sorter should reject it (wrong color) and it stays at B1.
    addItem(world, { defId: 'large-blue-circle', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 0 });

    tickWorld(world);

    // Blue item moved from (0,0) to (1,0) via belt, not grabbed by sorter
    expect(world.items.has(gridKey(1, 0))).toBe(true);
    expect(world.items.get(gridKey(1, 0))?.defId).toBe('large-blue-circle');
    expect(world.items.has(gridKey(1, 1))).toBe(false);
  });

  it('sorter pulls matching items while items further along the main line still reach the receiver', () => {
    const world = createWorld();

    // Longer line so we can verify both behaviours in one tick:
    //   [B0(0,0)] → [B1(1,0)] → [B2(2,0)] → [B3(3,0)] → [Receiver(4,0)]
    //                    ↑ sorter input
    //               [Sorter(1,1) S]
    placeBuilding(world, { type: 'belt',     x: 0, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt',     x: 1, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt',     x: 2, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt',     x: 3, y: 0, direction: Direction.E });
    placeBuilding(world, createTestReceiver(4, 0, Direction.E));
    placeBuilding(world, { type: 'sorter',   x: 1, y: 1, direction: Direction.S,
      filterProperty: 'color', filterValue: 'red' });

    // Red item on B1 (1,0) — the sorter's input cell
    addItem(world, { defId: 'small-red-square', x: 1, y: 0, renderX: 1, renderY: 0, renderScale: 0 });
    // Blue item on B3 (3,0) — should advance to receiver and be consumed
    addItem(world, { defId: 'large-blue-circle', x: 3, y: 0, renderX: 3, renderY: 0, renderScale: 0 });

    tickWorld(world);

    // Sorter took the red item from (1,0)
    expect(world.items.has(gridKey(1, 1))).toBe(true);
    expect(world.items.get(gridKey(1, 1))?.defId).toBe('small-red-square');
    expect(world.items.has(gridKey(1, 0))).toBe(false);

    // Blue item moved from B3(3,0) into the receiver and was consumed
    expect(world.items.has(gridKey(3, 0))).toBe(false);
    expect(world.items.has(gridKey(4, 0))).toBe(false);
  });
});
