import { describe, it, expect } from 'vitest';
import type { Receiver } from './types.ts';
import { Direction } from './types.ts';
import { createWorld, placeBuilding, addItem } from './world.ts';
import { tickWorld } from './simulation.ts';
import { requestRegistry } from './registry.ts';

describe('Request Logic', () => {
  it('should assign requests round-robin to receivers', () => {
    const world = createWorld();
    
    // We have 3 requests in requests.config.json
    const r1: Receiver = { type: 'receiver' as const, x: 0, y: 0, direction: Direction.E };
    const r2: Receiver = { type: 'receiver' as const, x: 1, y: 0, direction: Direction.E };
    const r3: Receiver = { type: 'receiver' as const, x: 2, y: 0, direction: Direction.E };
    const r4: Receiver = { type: 'receiver' as const, x: 3, y: 0, direction: Direction.E };

    placeBuilding(world, r1);
    placeBuilding(world, r2);
    placeBuilding(world, r3);
    placeBuilding(world, r4);

    const b1 = world.buildings.get('0,0') as Receiver;
    const b2 = world.buildings.get('1,0') as Receiver;
    const b3 = world.buildings.get('2,0') as Receiver;
    const b4 = world.buildings.get('3,0') as Receiver;

    const allRequests = requestRegistry.getAllRequests();
    expect(b1.requestId).toBe(allRequests[0].id);
    expect(b2.requestId).toBe(allRequests[1].id);
    expect(b3.requestId).toBe(allRequests[2].id);
    expect(b4.requestId).toBe(allRequests[0].id); // Wrapped around
  });

  it('should reward item cost if it matches request', () => {
    const world = createWorld();
    
    const receiver: Receiver = { type: 'receiver' as const, x: 10, y: 10, direction: Direction.E };
    placeBuilding(world, receiver);
    const assignedRequest = requestRegistry.getRequest((world.buildings.get('10,10') as Receiver).requestId!);
    
    expect(assignedRequest).toBeDefined();

    let itemDefId = '';
    if (assignedRequest?.id === 'small-red-stuff') {
      itemDefId = 'small-red-square';
    } else if (assignedRequest?.id === 'circular-objects') {
      itemDefId = 'large-blue-circle';
    } else if (assignedRequest?.id === 'green-or-blue') {
      itemDefId = 'medium-green-triangle';
    }

    addItem(world, { defId: itemDefId, x: 10, y: 10, renderX: 10, renderY: 10, renderScale: 0 });
    
    const belt = { type: 'belt' as const, x: 9, y: 10, direction: Direction.E };
    placeBuilding(world, belt);
    addItem(world, { defId: itemDefId, x: 9, y: 10, renderX: 9, renderY: 10, renderScale: 0 });
    world.items.delete('10,10');

    const initialMoney = world.playerMoney;
    tickWorld(world);
    
    expect(world.playerMoney).toBe(initialMoney + assignedRequest!.cost);
  });

  it('should apply penalty if it does not match request', () => {
    const world = createWorld();
    const receiver: Receiver = { type: 'receiver' as const, x: 20, y: 20, direction: Direction.E };
    placeBuilding(world, receiver);
    const assignedRequest = requestRegistry.getRequest((world.buildings.get('20,20') as Receiver).requestId!);
    
    let itemDefId = '';
    if (assignedRequest?.id === 'small-red-stuff') {
      itemDefId = 'large-blue-circle';
    } else if (assignedRequest?.id === 'circular-objects') {
      itemDefId = 'small-red-square';
    } else if (assignedRequest?.id === 'green-or-blue') {
      itemDefId = 'small-red-square';
    }

    const belt = { type: 'belt' as const, x: 19, y: 20, direction: Direction.E };
    placeBuilding(world, belt);
    addItem(world, { defId: itemDefId, x: 19, y: 20, renderX: 19, renderY: 20, renderScale: 0 });

    const initialMoney = world.playerMoney;
    tickWorld(world);
    
    expect(world.playerMoney).toBe(initialMoney - assignedRequest!.penalty);
  });
});
