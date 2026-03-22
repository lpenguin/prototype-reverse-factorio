import { describe, it, expect } from 'vitest';
import type { Receiver } from './types.ts';
import { Direction } from './types.ts';
import { createWorld, placeBuilding, addItem } from './world.ts';
import { tickWorld } from './simulation.ts';
import { requestRegistry } from './registry.ts';

describe('Request Logic', () => {
  it('should assign default request to new receivers', () => {
    const world = createWorld();
    
    const r1: Receiver = { 
      type: 'receiver' as const, x: 0, y: 0, direction: Direction.E,
      request: requestRegistry.getDefaultRequest()
    };
    placeBuilding(world, r1);

    const b1 = world.buildings.get('0,0') as Receiver;
    expect(b1.request.id).toBe('default-request');
    expect(b1.request.name).toBe('Any Item');
  });

  it('should reward item cost if it matches request', () => {
    const world = createWorld();
    
    const customRequest = requestRegistry.generateRandomRequest();
    const receiver: Receiver = { 
      type: 'receiver' as const, x: 10, y: 10, direction: Direction.E,
      request: customRequest
    };
    placeBuilding(world, receiver);
    
    // Find an item that matches this request
    const specificReq = {
      id: 'test-req',
      name: 'Red stuff',
      properties: { color: ['red'] },
      cost: 10,
      penalty: 5
    };
    (world.buildings.get('10,10') as Receiver).request = specificReq;

    const itemDefId = 'small-red-square'; // color: red
    
    const belt = { type: 'belt' as const, x: 9, y: 10, direction: Direction.E };
    placeBuilding(world, belt);
    addItem(world, { defId: itemDefId, x: 9, y: 10, renderX: 9, renderY: 10, renderScale: 0 });

    const initialMoney = world.playerMoney;
    tickWorld(world);
    
    expect(world.playerMoney).toBe(initialMoney + specificReq.cost);
  });

  it('should apply penalty if it does not match request', () => {
    const world = createWorld();
    // Clear everything to ensure a clean test
    world.buildings.clear();
    world.items.clear();
    world.playerMoney = 0; 

    const specificReq = {
      id: 'test-req',
      name: 'Red stuff',
      properties: { color: ['red'] },
      cost: 10,
      penalty: 5
    };
    
    // Use placeBuilding but then override the request to be certain
    const receiver: Receiver = { 
      type: 'receiver' as const, x: 20, y: 20, direction: Direction.E,
      request: specificReq
    };
    placeBuilding(world, receiver);
    (world.buildings.get('20,20') as Receiver).request = specificReq;
    
    const itemDefId = 'large-blue-circle'; // color: blue

    const belt = { type: 'belt' as const, x: 19, y: 20, direction: Direction.E };
    placeBuilding(world, belt);
    addItem(world, { defId: itemDefId, x: 19, y: 20, renderX: 19, renderY: 20, renderScale: 0 });

    tickWorld(world);
    
    expect(world.playerMoney).toBe(-specificReq.penalty);
  });

  it('should match request using runtime-assigned item color instead of defId defaults', () => {
    const world = createWorld();
    world.buildings.clear();
    world.items.clear();
    world.playerMoney = 0;

    const specificReq = {
      id: 'test-req-runtime-color',
      name: 'Red stuff',
      properties: { color: ['red'] },
      cost: 10,
      penalty: 5
    };

    const receiver: Receiver = {
      type: 'receiver' as const, x: 30, y: 30, direction: Direction.E,
      request: specificReq
    };
    placeBuilding(world, receiver);
    (world.buildings.get('30,30') as Receiver).request = specificReq;

    placeBuilding(world, { type: 'belt', x: 29, y: 30, direction: Direction.E });
    addItem(world, {
      defId: 'large-blue-circle',
      color: 'red',
      x: 29,
      y: 30,
      renderX: 29,
      renderY: 30,
      renderScale: 0,
    });

    tickWorld(world);

    expect(world.playerMoney).toBe(specificReq.cost);
  });
});
