import { describe, it, expect } from 'vitest';
import { Direction } from './types.ts';
import { createWorld, placeBuilding, addItem, gridKey } from './world.ts';
import { tickWorld } from './simulation.ts';

describe('Simulation Logic', () => {
  it('should move items across a belt chain in a single tick in sink-to-source order', () => {
    const world = createWorld();
    
    // Belt chain: B1 (1,0) -> B2 (2,0) -> B3 (3,0)
    placeBuilding(world, { type: 'belt', x: 1, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt', x: 2, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt', x: 3, y: 0, direction: Direction.E });
    // Receiver at (4, 0) fed by B3
    placeBuilding(world, { type: 'receiver', x: 4, y: 0, direction: Direction.E });

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
    placeBuilding(world, { type: 'receiver', x: 4, y: 0, direction: Direction.E });

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
    placeBuilding(world, { type: 'receiver', x: 2, y: 0, direction: Direction.E });

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
