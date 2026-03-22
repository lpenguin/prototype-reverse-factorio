// @vitest-environment happy-dom
/**
 * Tests for the item-id keying fix.
 *
 * Background: Items were previously tracked in the scene by their *grid
 * position* ("x,y" string).  When a new item of a different type appeared at
 * a cell that had just been vacated by another item in the same tick,
 * `diffMap` found an existing scene node at that key and called
 * `_updateItemNode` instead of `_createItemNode`, silently reusing the wrong
 * SVG shape.  The fix keys scene nodes by `item.id` instead, so every unique
 * item always owns its own node.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneManager } from './scene-manager.ts';
import { GroupNode } from './scene.ts';
import type { ShapeNode } from './scene.ts';
import { WorldRenderer } from './world-renderer.ts';
import { addItem, nextItemId, gridKey } from './world.ts';
import { createWorld } from './world.ts';
import type { WorldState } from './types.ts';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeSvgGroup(): SVGGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'g');
}

// ─── nextItemId ──────────────────────────────────────────────────────────────

describe('nextItemId', () => {
  it('returns a different string on every call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => nextItemId()));
    expect(ids.size).toBe(100);
  });

  it('returns non-empty strings', () => {
    expect(nextItemId().length).toBeGreaterThan(0);
  });
});

// ─── addItem id assignment ───────────────────────────────────────────────────

describe('addItem id assignment', () => {
  let world: WorldState;

  beforeEach(() => {
    world = createWorld();
  });

  it('auto-assigns a non-empty id when none is provided', () => {
    addItem(world, { x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    const item = world.items.get(gridKey(0, 0))!;
    expect(item.id).toBeTruthy();
  });

  it('preserves an explicitly supplied id', () => {
    addItem(world, { id: 'my-custom-id', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    const item = world.items.get(gridKey(0, 0))!;
    expect(item.id).toBe('my-custom-id');
  });

  it('assigns distinct ids to items placed at different cells', () => {
    addItem(world, { x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    addItem(world, { x: 1, y: 0, renderX: 1, renderY: 0, renderScale: 1 });
    addItem(world, { x: 2, y: 0, renderX: 2, renderY: 0, renderScale: 1 });

    const ids = [
      world.items.get(gridKey(0, 0))!.id,
      world.items.get(gridKey(1, 0))!.id,
      world.items.get(gridKey(2, 0))!.id,
    ];

    expect(new Set(ids).size).toBe(3);
  });

  it('applies default shape/color/size when omitted', () => {
    addItem(world, { x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    const item = world.items.get(gridKey(0, 0))!;
    expect(item.shape).toBeUndefined();
    expect(item.color).toBeUndefined();
    expect(item.size).toBeUndefined();
  });
});

// ─── SceneManager.diffMap key semantics ─────────────────────────────────────

describe('SceneManager.diffMap key semantics', () => {
  let manager: SceneManager;

  beforeEach(() => {
    manager = new SceneManager(makeSvgGroup(), ['items']);
  });

  it('calls createFn for a key not yet tracked', () => {
    let created = 0;
    const src = new Map([['a', 1]]);
    manager.diffMap('items', src, () => { created++; return new GroupNode(); }, () => {});
    expect(created).toBe(1);
  });

  it('calls updateFn for a key already tracked, not createFn', () => {
    let created = 0;
    let updated = 0;
    const src = new Map([['a', 1]]);

    // First pass → creates the node
    manager.diffMap('items', src, () => { created++; return new GroupNode(); }, () => { updated++; });
    // Second pass with the same key → updates the node
    manager.diffMap('items', src, () => { created++; return new GroupNode(); }, () => { updated++; });

    expect(created).toBe(1);
    expect(updated).toBe(1);
  });

  it('removes stale nodes when they disappear from the source map', () => {
    const src = new Map([['a', 1]]);
    manager.diffMap('items', src, () => new GroupNode(), () => {});

    expect(manager.getNode('items', 'a')).toBeDefined();

    manager.diffMap('items', new Map(), () => new GroupNode(), () => {});

    expect(manager.getNode('items', 'a')).toBeUndefined();
  });

  /**
   * This is the regression scenario at the heart of the bug:
   *
   * Tick N: itemA occupies cell (0,0), keyed "0,0" in the old code.
   * Tick N+1: itemA moves away; itemB (different type) appears at (0,0).
   *
   * Old code: both ticks use key "0,0" → itemB reuses itemA's node → wrong shape.
   * Fixed code: keys are item ids → itemA's node is removed; itemB gets a fresh node.
   */
  it('creates a fresh node when a different item appears at a previously-occupied key', () => {
    const createdNodes: string[] = [];

    // Tick N: itemA at "cell-0"
    const srcA = new Map([['id-A', 'circle']]);
    manager.diffMap(
      'items',
      srcA,
      (key) => { createdNodes.push(key); return new GroupNode(); },
      () => {},
    );

    expect(createdNodes).toEqual(['id-A']);

    // Tick N+1: itemA gone, itemB at the same logical cell but with a different id
    const srcB = new Map([['id-B', 'triangle']]);
    manager.diffMap(
      'items',
      srcB,
      (key) => { createdNodes.push(key); return new GroupNode(); },
      () => {},
    );

    // id-A's node must be gone; id-B must have a new node
    expect(manager.getNode('items', 'id-A')).toBeUndefined();
    expect(manager.getNode('items', 'id-B')).toBeDefined();
    expect(createdNodes).toEqual(['id-A', 'id-B']);
  });

  it('does NOT create a new node when the same key appears in successive ticks', () => {
    const createdNodes: string[] = [];
    const src = new Map([['id-A', 'value']]);

    manager.diffMap('items', src, (key) => { createdNodes.push(key); return new GroupNode(); }, () => {});
    manager.diffMap('items', src, (key) => { createdNodes.push(key); return new GroupNode(); }, () => {});
    manager.diffMap('items', src, (key) => { createdNodes.push(key); return new GroupNode(); }, () => {});

    // createFn called only once despite three ticks
    expect(createdNodes).toEqual(['id-A']);
  });
});

// ─── WorldRenderer.syncItems id-keyed diffMap ────────────────────────────────

describe('WorldRenderer.syncItems id-based node management', () => {
  let renderer: WorldRenderer;

  beforeEach(() => {
    renderer = new WorldRenderer(makeSvgGroup(), makeSvgGroup());
  });

  /**
   * Helper: inspect the 'items' layer nodes tracked by the scene manager.
   * Returns an array of the scene-node keys currently tracked.
   */
  function trackedItemKeys(): string[] {
    return Array.from(renderer.scene.getAllNodes('items').keys());
  }

  it('creates one scene node per item, keyed by item.id', () => {
    const world = createWorld();
    addItem(world, { x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    addItem(world, { x: 1, y: 0, renderX: 1, renderY: 0, renderScale: 1 });
    addItem(world, { x: 2, y: 0, renderX: 2, renderY: 0, renderScale: 1 });

    renderer.syncItems(world);

    const ids = [
      world.items.get(gridKey(0, 0))!.id,
      world.items.get(gridKey(1, 0))!.id,
      world.items.get(gridKey(2, 0))!.id,
    ];

    for (const id of ids) {
      expect(renderer.scene.getNode('items', id)).toBeDefined();
    }
    expect(trackedItemKeys().length).toBe(3);
  });

  it('renders explicit shape and color properties', () => {
    const world = createWorld();
    addItem(world, {
      shape: 'triangle',
      color: 'blue',
      size: 'large',
      x: 0,
      y: 0,
      renderX: 0,
      renderY: 0,
      renderScale: 1,
    });

    renderer.syncItems(world);

    const itemId = world.items.get(gridKey(0, 0))!.id;
    const node = renderer.scene.getNode('items', itemId) as ShapeNode;
    expect(node.shape).toBe('polygon');
    expect(node.fill).toBe('#4444ff');
    expect(node.points).toContain('10'); // large size -> triangle points use +/-10
  });

  it('reuses the same node when an item moves to a different cell (same id)', () => {
    const world = createWorld();
    addItem(world, { x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });

    renderer.syncItems(world);

    const itemId = world.items.get(gridKey(0, 0))!.id;
    const nodeAfterFirstSync = renderer.scene.getNode('items', itemId);
    expect(nodeAfterFirstSync).toBeDefined();

    // Simulate the item moving: remove from old cell, add to new cell (same object, same id)
    const item = world.items.get(gridKey(0, 0))!;
    world.items.delete(gridKey(0, 0));
    item.x = 1;
    item.renderX = 1;
    world.items.set(gridKey(1, 0), item);

    renderer.syncItems(world);

    // The node object must be the exact same reference — no re-creation
    expect(renderer.scene.getNode('items', itemId)).toBe(nodeAfterFirstSync);
    expect(trackedItemKeys()).toEqual([itemId]);
  });

  /**
   * Core regression test: the shape-reuse bug.
   *
   * Before the fix syncItems keyed nodes by grid position. When itemA left
   * cell (0,0) and itemB arrived at (0,0) in the same tick, the renderer
   * found the existing node at "0,0" and called _updateItemNode instead of
   * _createItemNode — making itemB look like itemA visually.
   *
   * With the fix, each item's id is the key. itemA's node is removed and
   * itemB gets a brand-new node whose SVG shape matches itemB's type.
   */
  it('regression: new item at a vacated cell gets a fresh node, not the old one', () => {
    const world = createWorld();

    // Tick 1: blue circle at (0,0)
    addItem(world, { color: 'blue', shape: 'circle', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    renderer.syncItems(world);

    const circleId = world.items.get(gridKey(0, 0))!.id;
    const circleNode = renderer.scene.getNode('items', circleId)!;
    expect(circleNode).toBeDefined();

    // Tick 2: blue circle leaves (0,0); triangle appears at (0,0)
    world.items.delete(gridKey(0, 0));
    addItem(world, { shape: 'triangle', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    renderer.syncItems(world);

    const triangleId = world.items.get(gridKey(0, 0))!.id;

    // The circle's node must be gone
    expect(renderer.scene.getNode('items', circleId)).toBeUndefined();

    // The triangle must have its own, different node
    const triangleNode = renderer.scene.getNode('items', triangleId)!;
    expect(triangleNode).toBeDefined();
    expect(triangleNode).not.toBe(circleNode);

    // Only one node in the layer
    expect(trackedItemKeys()).toEqual([triangleId]);
  });

  it('removes the scene node when an item is removed from the world', () => {
    const world = createWorld();
    addItem(world, { x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    renderer.syncItems(world);

    const itemId = world.items.get(gridKey(0, 0))!.id;
    expect(renderer.scene.getNode('items', itemId)).toBeDefined();

    world.items.delete(gridKey(0, 0));
    renderer.syncItems(world);

    expect(renderer.scene.getNode('items', itemId)).toBeUndefined();
    expect(trackedItemKeys().length).toBe(0);
  });

  it('dyingItems are kept in the scene until they leave the dying map', () => {
    const world = createWorld();
    addItem(world, { x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    renderer.syncItems(world);

    const dying = world.items.get(gridKey(0, 0))!;
    world.items.delete(gridKey(0, 0));

    // Pass dying item in the dyingItems map
    const dyingMap = new Map([[dying.id, dying]]);
    renderer.syncItems(world, dyingMap);

    // Node still present because the item is dying (fade-out)
    expect(renderer.scene.getNode('items', dying.id)).toBeDefined();

    // Once dying map is cleared, node is removed
    renderer.syncItems(world, new Map());
    expect(renderer.scene.getNode('items', dying.id)).toBeUndefined();
  });

  it('a dying item and a new item at the same cell both get correct nodes', () => {
    const world = createWorld();

    // Tick 1: item A
    addItem(world, { color: 'blue', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    renderer.syncItems(world);
    const circleId = world.items.get(gridKey(0, 0))!.id;
    const circle = world.items.get(gridKey(0, 0))!;

    // Tick 2: item A is now dying; item B takes the cell
    world.items.delete(gridKey(0, 0));
    addItem(world, { color: 'red', x: 0, y: 0, renderX: 0, renderY: 0, renderScale: 1 });
    const squareId = world.items.get(gridKey(0, 0))!.id;

    const dyingMap = new Map([[circle.id, circle]]);
    renderer.syncItems(world, dyingMap);

    // Both items must have their own distinct node
    const circleNode = renderer.scene.getNode('items', circleId);
    const squareNode = renderer.scene.getNode('items', squareId);
    expect(circleNode).toBeDefined();
    expect(squareNode).toBeDefined();
    expect(circleNode).not.toBe(squareNode);
    expect(trackedItemKeys().sort()).toEqual([circleId, squareId].sort());
  });
});
