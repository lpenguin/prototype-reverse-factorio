import { describe, it, expect } from 'vitest';
import { Direction } from '../src/types.ts';
import { createWorld, placeBuilding, gridKey, getDirectionOffset, getPortCell } from '../src/world.ts';

describe('World Logic', () => {
  it('should create an empty world', () => {
    const world = createWorld();
    expect(world.buildings.size).toBe(0);
    expect(world.playerMoney).toBe(0);
  });

  it('should place and generate correct keys for buildings', () => {
    const world = createWorld();
    const belt = { type: 'belt' as const, x: 10, y: 20, direction: Direction.E };
    
    expect(placeBuilding(world, belt)).toBe(true);
    expect(world.buildings.has(gridKey(10, 20))).toBe(true);
    // Occupied
    expect(placeBuilding(world, { ...belt, x: 10, y: 20 })).toBe(false);
  });

  it('should calculate direction offsets correctly', () => {
    expect(getDirectionOffset(Direction.N)).toEqual({ dx: 0, dy: -1 });
    expect(getDirectionOffset(Direction.E)).toEqual({ dx: 1, dy: 0 });
    expect(getDirectionOffset(Direction.SE)).toEqual({ dx: 1, dy: 1 });
  });

  it('should calculate port cells correctly', () => {
    const emitter = { x: 5, y: 5 };
    const port = getPortCell(emitter, Direction.S);
    expect(port).toEqual({ x: 5, y: 6 });
  });
});
