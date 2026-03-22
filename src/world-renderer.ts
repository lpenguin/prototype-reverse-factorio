import type { ViewState, WorldState, ItemInstance, Building, StaticObject } from './types.ts';
import { CELL_SIZE } from './types.ts';
import type { SceneNode } from './scene.ts';
import { GroupNode, SpriteNode, ShapeNode, LineNode } from './scene.ts';
import { SceneManager } from './scene-manager.ts';
import { buildingsRegistry as registry, itemRegistry, propertyRegistry } from './registry.ts';
import { gridKey, getDirectionOffset } from './world.ts';
import { createBuildingRenderHandler, type BuildingRenderHandler } from './rendering-handlers.ts';

/**
 * Game-specific bridge between WorldState and the generic SceneManager.
 * Translates game entities into scene graph nodes via diffMap.
 */
export class WorldRenderer {
  readonly scene: SceneManager;

  // Cached grid state for change detection
  private _gridGroup: SVGGElement;
  private _prevGridBounds = { startX: NaN, startY: NaN, endX: NaN, endY: NaN };
  private _gridLines: SVGLineElement[] = [];

  // Preview cache for change detection
  private _prevPreview = { buildingId: '', x: NaN, y: NaN, direction: NaN };

  // Per-instance building render handlers
  private readonly _buildingHandlers = new Map<string, ReturnType<typeof createBuildingRenderHandler>>();

  constructor(
    worldGroup: SVGGElement,
    gridGroup: SVGGElement,
  ) {
    this.scene = new SceneManager(worldGroup, ['static', 'wires', 'buildings', 'items', 'preview']);
    this._gridGroup = gridGroup;
  }

  // ── Static objects (garbage) ──────────────────────────────────────

  syncStaticObjects(world: WorldState): void {
    this.scene.diffMap<StaticObject>(
      'static',
      world.staticObjects,
      (_key, obj) => this._createGarbageNode(obj),
      () => {}, // static objects never change
    );
  }

  private _createGarbageNode(obj: StaticObject): SceneNode {
    const group = new GroupNode();
    const x = obj.x * CELL_SIZE;
    const y = obj.y * CELL_SIZE;

    const rect = new ShapeNode('rect');
    rect.setRect(x, y, CELL_SIZE, CELL_SIZE);
    rect.fill = '#a5a5a5';
    rect.fillOpacity = 0.4;
    group.addChild(rect);

    // Deterministic decorative lines
    const seed = (obj.x * 374761393 + obj.y * 668265263) ^ 0x9e3779b9;
    const pseudoRandom = (s: number) => {
      const val = Math.sin(s) * 10000;
      return val - Math.floor(val);
    };

    for (let i = 0; i < 4; i++) {
      const line = new LineNode();
      line.x1 = x + pseudoRandom(seed + i * 10) * CELL_SIZE;
      line.y1 = y + pseudoRandom(seed + i * 10 + 1) * CELL_SIZE;
      line.x2 = x + pseudoRandom(seed + i * 10 + 2) * CELL_SIZE;
      line.y2 = y + pseudoRandom(seed + i * 10 + 3) * CELL_SIZE;
      line.lineStroke = '#666';
      line.lineStrokeWidth = 1.5;
      group.addChild(line);
    }

    return group;
  }

  // ── Buildings ─────────────────────────────────────────────────────

  syncWires(world: WorldState): void {
    const wireMap = new Map<string, { n: boolean; e: boolean; s: boolean; w: boolean }>();
    for (const key of world.wireCells) {
      const [x, y] = key.split(',').map(Number);
      wireMap.set(key, {
        n: world.wireCells.has(gridKey(x, y - 1)),
        e: world.wireCells.has(gridKey(x + 1, y)),
        s: world.wireCells.has(gridKey(x, y + 1)),
        w: world.wireCells.has(gridKey(x - 1, y)),
      });
    }

    this.scene.diffMap<{ n: boolean; e: boolean; s: boolean; w: boolean }>(
      'wires',
      wireMap,
      (key, cell) => this._createWireNode(key, cell),
      () => {},
    );
  }

  private _createWireNode(
    key: string,
    cell: { n: boolean; e: boolean; s: boolean; w: boolean },
  ): SceneNode {
    const group = new GroupNode();

    const [x, y] = key.split(',').map(Number);
    const cx = x * CELL_SIZE + CELL_SIZE / 2;
    const cy = y * CELL_SIZE + CELL_SIZE / 2;

    const addSegment = (x1: number, y1: number, x2: number, y2: number) => {
      const shell = new LineNode();
      shell.x1 = x1;
      shell.y1 = y1;
      shell.x2 = x2;
      shell.y2 = y2;
      shell.lineStroke = '#1e293b';
      shell.lineStrokeWidth = 10;
      group.addChild(shell);

      const core = new LineNode();
      core.x1 = x1;
      core.y1 = y1;
      core.x2 = x2;
      core.y2 = y2;
      core.lineStroke = '#d97706';
      core.lineStrokeWidth = 4;
      group.addChild(core);
    };

    const half = CELL_SIZE / 2;
    if (cell.n) addSegment(cx, cy, cx, cy - half);
    if (cell.e) addSegment(cx, cy, cx + half, cy);
    if (cell.s) addSegment(cx, cy, cx, cy + half);
    if (cell.w) addSegment(cx, cy, cx - half, cy);

    // Endcap dot for isolated cell or junction hub for connected cell
    const hubOuter = new ShapeNode('circle');
    hubOuter.x = cx;
    hubOuter.y = cy;
    hubOuter.size = 10;
    hubOuter.fill = '#1e293b';
    hubOuter.stroke = '#0f172a';
    hubOuter.strokeWidth = 1;
    group.addChild(hubOuter);

    const hubInner = new ShapeNode('circle');
    hubInner.x = cx;
    hubInner.y = cy;
    hubInner.size = 4;
    hubInner.fill = '#fbbf24';
    group.addChild(hubInner);

    return group;
  }

  getBuildingHandler(key: string): BuildingRenderHandler<Building> | undefined {
    return this._buildingHandlers.get(key);
  }

  syncBuildings(world: WorldState): void {
    const removed = this.scene.diffMap<Building>(
      'buildings',
      world.buildings,
      (key, building) => this._createBuildingNode(world, key, building),
      (key, building, node) => this._updateBuildingNode(world, key, building, node),
    );

    for (const key of removed) {
      this._buildingHandlers.get(key)?.onRemove();
      this._buildingHandlers.delete(key);
    }
  }

  private _createBuildingNode(world: WorldState, key: string, building: Building): SceneNode {
    const group = new GroupNode();
    const handler = createBuildingRenderHandler(building.type);
    if (handler) {
      this._buildingHandlers.set(key, handler);
      handler.applyState(world, building, group);
      handler.syncAnimation(world, group);
    }
    return group;
  }

  private _updateBuildingNode(world: WorldState, key: string, building: Building, node: SceneNode): void {
    const group = node as GroupNode;
    const handler = this._buildingHandlers.get(key);

    if (handler?.needsRebuild(world, building)) {
      handler.onRemove();
      for (let i = node.children.length - 1; i >= 0; i--) {
        node.children[i].destroy();
      }
      handler.applyState(world, building, group);
      handler.syncAnimation(world, group);
      return;
    }

    handler?.syncAnimation(world, group);
  }

  // ── Items ─────────────────────────────────────────────────────────

  syncItems(world: WorldState, dyingItems?: Map<string, ItemInstance>): void {
    // Build a combined map keyed by item.id (not grid position) so that
    // the same item object always maps to the same scene node regardless of
    // which cell it occupies. This prevents _updateItemNode being called on a
    // node that was created for a different item type.
    const combined = new Map<string, ItemInstance>();

    for (const item of world.items.values()) {
      combined.set(item.id, item);
    }

    if (dyingItems) {
      for (const item of dyingItems.values()) {
        if (!combined.has(item.id)) {
          combined.set(item.id, item);
        }
      }
    }

    this.scene.diffMap<ItemInstance>(
      'items',
      combined,
      (_key, item) => this._createItemNode(item),
      (_key, item, node) => this._updateItemNode(item, node),
    );
  }

  private _createItemNode(item: ItemInstance): SceneNode {
    const def = itemRegistry.getItem(item.defId);
    if (!def) return new GroupNode();

    const props = def.properties;
    const size = (propertyRegistry.getValue('size', props.size as string) as number) || 24;
    const shape = (propertyRegistry.getValue('shape', props.shape as string) as string) || 'circle';
    const color = (propertyRegistry.getValue('color', props.color as string) as string) || '#888';

    let shapeNode: ShapeNode;
    if (shape === 'circle') {
      shapeNode = new ShapeNode('circle');
      shapeNode.size = size;
      shapeNode.fill = color;
    } else if (shape === 'triangle') {
      shapeNode = new ShapeNode('polygon');
      const s = size;
      shapeNode.points = `0,-${s / 2} ${s / 2},${s / 2} -${s / 2},${s / 2}`;
      shapeNode.fill = color;
    } else {
      shapeNode = new ShapeNode('rect');
      shapeNode.size = size;
      shapeNode.fill = color;
    }

    // Set initial transform from render position
    const cx = item.renderX * CELL_SIZE + CELL_SIZE / 2;
    const cy = item.renderY * CELL_SIZE + CELL_SIZE / 2;
    shapeNode.x = cx;
    shapeNode.y = cy;
    shapeNode.scaleX = item.renderScale;
    shapeNode.scaleY = item.renderScale;

    return shapeNode;
  }

  private _updateItemNode(item: ItemInstance, node: SceneNode): void {
    // Update transform every frame (lerped values)
    const cx = item.renderX * CELL_SIZE + CELL_SIZE / 2;
    const cy = item.renderY * CELL_SIZE + CELL_SIZE / 2;
    node.x = cx;
    node.y = cy;
    node.scaleX = item.renderScale;
    node.scaleY = item.renderScale;
  }

  // ── Preview ghost ─────────────────────────────────────────────────

  syncPreview(view: ViewState, world: WorldState): void {
    const buildingId = view.selectedBuildingId ?? '';
    const px = view.previewCoords?.x ?? NaN;
    const py = view.previewCoords?.y ?? NaN;
    const dir = view.selectedDirection;

    // Check if anything changed
    const prev = this._prevPreview;
    const changed = prev.buildingId !== buildingId || prev.x !== px || prev.y !== py || prev.direction !== dir;
    if (!changed) return;

    prev.buildingId = buildingId;
    prev.x = px;
    prev.y = py;
    prev.direction = dir;

    // Remove old preview
    const existing = this.scene.getNode('preview', 'ghost');
    if (existing) this.scene.removeNode('preview', 'ghost');

    if (!buildingId || isNaN(px)) return;

    if (buildingId === 'wire') {
      const group = new GroupNode();
      group.el.style.pointerEvents = 'none';

      for (const key of view.wirePreviewCells) {
        const [wx, wy] = key.split(',').map(Number);
        const tile = new ShapeNode('rect');
        tile.setRect(wx * CELL_SIZE + 10, wy * CELL_SIZE + 10, CELL_SIZE - 20, CELL_SIZE - 20);
        tile.fill = '#22c55e';
        tile.fillOpacity = 0.75;
        tile.stroke = '#14532d';
        tile.strokeWidth = 1;
        group.addChild(tile);
      }

      this.scene.addNode('preview', 'ghost', group);
      return;
    }

    const x = px;
    const y = py;
    const isErase = buildingId === 'erase';
    const def = isErase ? null : registry.getBuilding(buildingId);

    const key = gridKey(x, y);
    const isOccupied = world.buildings.has(key) || world.buildingSecondary.has(key);

    // For multi-cell buildings also check the secondary cell
    let isSecondaryOccupied = false;
    if (def && (def.size.x > 1 || def.size.y > 1)) {
      const { dx: sdx, dy: sdy } = getDirectionOffset(dir);
      const secondaryKey = gridKey(x - sdy, y + sdx);
      isSecondaryOccupied = world.buildings.has(secondaryKey) || world.buildingSecondary.has(secondaryKey);
    }

    let isInvalidStatic = false;
    if (def?.preferredStaticTypes && def.preferredStaticTypes.length > 0) {
      const staticObj = world.staticObjects.get(key);
      if (!staticObj || !def.preferredStaticTypes.includes(staticObj.type)) {
        isInvalidStatic = true;
      }
    }
    const isInvalid = isOccupied || isSecondaryOccupied || isInvalidStatic;

    let color: string, strokeColor: string;
    if (isErase) {
      color = isOccupied ? 'rgba(255, 0, 0, 0.4)' : 'rgba(100, 100, 100, 0.2)';
      strokeColor = isOccupied ? 'rgba(255, 0, 0, 0.8)' : 'rgba(100, 100, 100, 0.4)';
    } else {
      color = isInvalid ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 255, 0, 0.2)';
      strokeColor = isInvalid ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 255, 0, 0.5)';
    }

    const rotation = (dir - 1) * 90;
    const centerX = x * CELL_SIZE + CELL_SIZE / 2;
    const centerY = y * CELL_SIZE + CELL_SIZE / 2;

    const group = new GroupNode();
    group.el.style.pointerEvents = 'none';

    if (buildingId === 'splitter' || buildingId === 'merger') {
      // 2-cell ghost: anchor + secondary (perpendicular-right) cell
      const { dx: sdx, dy: sdy } = getDirectionOffset(dir);
      const sx = x - sdy;
      const sy = y + sdx;

      const anchorGhost = new ShapeNode('rect');
      anchorGhost.setRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      anchorGhost.fill = color;
      anchorGhost.stroke = strokeColor;
      anchorGhost.strokeWidth = 2;
      group.addChild(anchorGhost);

      const secondaryGhost = new ShapeNode('rect');
      secondaryGhost.setRect(sx * CELL_SIZE, sy * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      secondaryGhost.fill = color;
      secondaryGhost.stroke = strokeColor;
      secondaryGhost.strokeWidth = 2;
      group.addChild(secondaryGhost);

      // 2-cell icon (same math as _applyBuildingState)
      if (def?.iconPath) {
        const spanCenterX = (x + 0.5 - 0.5 * sdy) * CELL_SIZE;
        const spanCenterY = (y + 0.5 + 0.5 * sdx) * CELL_SIZE;
        const iconRotation = (dir - 1) * 90;
        const icon = new SpriteNode();
        icon.href = def.iconPath;
        icon.width = CELL_SIZE - 8;
        icon.height = 2 * CELL_SIZE - 8;
        icon.imgX = spanCenterX - (CELL_SIZE - 8) / 2;
        icon.imgY = spanCenterY - (2 * CELL_SIZE - 8) / 2;
        icon.imgOpacity = 0.6;
        icon.imgRotation = iconRotation;
        icon.imgPivotX = spanCenterX;
        icon.imgPivotY = spanCenterY;
        group.addChild(icon);
      }
    } else {
      // Ghost rect
      const ghost = new ShapeNode('rect');
      ghost.setRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      ghost.fill = color;
      ghost.stroke = strokeColor;
      ghost.strokeWidth = 2;
      group.addChild(ghost);

      // Icon
      const iconPath = isErase ? '/icons/erase.svg' : def?.iconPath;
      if (iconPath) {
        const icon = new SpriteNode();
        icon.href = iconPath;
        icon.imgX = x * CELL_SIZE + 4;
        icon.imgY = y * CELL_SIZE + 4;
        icon.width = CELL_SIZE - 8;
        icon.height = CELL_SIZE - 8;
        icon.imgOpacity = 0.6;
        if (!isErase) {
          icon.imgRotation = rotation;
          icon.imgPivotX = centerX;
          icon.imgPivotY = centerY;
        }
        group.addChild(icon);
      }
    }

    this.scene.addNode('preview', 'ghost', group);
  }

  // ── Grid lines (cached) ───────────────────────────────────────────

  renderGridLines(view: ViewState, width: number, height: number): void {
    const { panX, panY, zoom } = view;
    const scaledCellSize = CELL_SIZE * zoom;

    const startX = Math.floor(-panX / scaledCellSize);
    const endX = Math.ceil((width - panX) / scaledCellSize);
    const startY = Math.floor(-panY / scaledCellSize);
    const endY = Math.ceil((height - panY) / scaledCellSize);

    // Apply the same transform as the world group so lines are in world space
    this._gridGroup.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);

    const prev = this._prevGridBounds;
    if (prev.startX === startX && prev.endX === endX &&
        prev.startY === startY && prev.endY === endY) {
      return; // Cell bounds unchanged — world-space line positions are still correct
    }
    prev.startX = startX; prev.endX = endX;
    prev.startY = startY; prev.endY = endY;

    // Rebuild grid lines in world coordinates
    const g = this._gridGroup;
    const totalLines = (endX - startX + 1) + (endY - startY + 1);
    while (this._gridLines.length < totalLines) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', '#ccc');
      line.setAttribute('stroke-width', '0.5');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(line);
      this._gridLines.push(line);
    }
    // Hide excess
    for (let i = totalLines; i < this._gridLines.length; i++) {
      this._gridLines[i].style.display = 'none';
    }

    const worldTop = startY * CELL_SIZE;
    const worldBottom = endY * CELL_SIZE;
    const worldLeft = startX * CELL_SIZE;
    const worldRight = endX * CELL_SIZE;

    let idx = 0;
    // Vertical lines
    for (let x = startX; x <= endX; x++) {
      const lineX = x * CELL_SIZE;
      const line = this._gridLines[idx++];
      line.style.display = '';
      line.setAttribute('x1', lineX.toString());
      line.setAttribute('y1', worldTop.toString());
      line.setAttribute('x2', lineX.toString());
      line.setAttribute('y2', worldBottom.toString());
    }
    // Horizontal lines
    for (let y = startY; y <= endY; y++) {
      const lineY = y * CELL_SIZE;
      const line = this._gridLines[idx++];
      line.style.display = '';
      line.setAttribute('x1', worldLeft.toString());
      line.setAttribute('y1', lineY.toString());
      line.setAttribute('x2', worldRight.toString());
      line.setAttribute('y2', lineY.toString());
    }
  }

  // ── Top-level sync ────────────────────────────────────────────────

  syncAll(world: WorldState, view: ViewState, dyingItems?: Map<string, ItemInstance>): void {
    this.syncStaticObjects(world);
    this.syncWires(world);
    this.syncBuildings(world);
    this.syncItems(world, dyingItems);
    this.syncPreview(view, world);
    this.scene.syncAllDOM();
  }
}
