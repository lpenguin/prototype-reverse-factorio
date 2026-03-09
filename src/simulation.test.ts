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

  it('should not move item if blocked by another item that cannot move', () => {
    const world = createWorld();
    
    // Belt chain: (1,0) -> (2,0). No receiver, so (2,0) is a dead end.
    placeBuilding(world, { type: 'belt', x: 1, y: 0, direction: Direction.E });
    placeBuilding(world, { type: 'belt', x: 2, y: 0, direction: Direction.E });
    
    // To prevent movement out of B2, we could put a building that doesn't accept items
    // but the current moveItem logic says if there is NO building at (3,0), it CAN move there.
    // So let's block (3,0) with something that doesn't accept items.
    // Actually, emitters don't accept items.
    placeBuilding(world, { type: 'emitter', x: 3, y: 0, direction: Direction.S, itemPool: [] });

    addItem(world, { defId: 'item1', x: 1, y: 0, renderX: 1, renderY: 0, renderScale: 0 });
    addItem(world, { defId: 'item2', x: 2, y: 0, renderX: 2, renderY: 0, renderScale: 0 });

    tickWorld(world);

    // B2 tries to move to (3,0). Emitter at (3,0) doesn't accept. Stays at (2,0).
    // B1 tries to move to (2,0). Occupied by item2. Stays at (1,0).

    expect(world.items.get(gridKey(1, 0))?.defId).toBe('item1');
    expect(world.items.get(gridKey(2, 0))?.defId).toBe('item2');
  });
});
