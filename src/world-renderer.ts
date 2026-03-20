import type { ViewState, WorldState, ItemInstance, Building, Receiver, Sorter, StaticObject } from './types.ts';
import { CELL_SIZE } from './types.ts';
import { SceneNode, GroupNode, SpriteNode, ShapeNode, TextNode, LineNode } from './scene.ts';
import { SceneManager } from './scene-manager.ts';
import { buildingsRegistry as registry, itemRegistry, propertyRegistry } from './registry.ts';
import { gridKey } from './world.ts';

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

  constructor(worldGroup: SVGGElement, gridGroup: SVGGElement) {
    this.scene = new SceneManager(worldGroup, ['static', 'buildings', 'items', 'preview']);
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

  syncBuildings(world: WorldState): void {
    this.scene.diffMap<Building>(
      'buildings',
      world.buildings,
      (_key, building) => this._createBuildingNode(building),
      (_key, building, node) => this._updateBuildingNode(building, node),
    );
  }

  private _createBuildingNode(building: Building): SceneNode {
    const group = new GroupNode();
    (group as any)._buildingState = {};
    this._applyBuildingState(building, group);
    return group;
  }

  private _updateBuildingNode(building: Building, node: SceneNode): void {
    const state = (node as any)._buildingState;
    const rotation = ((building.direction ?? 1) - 1) * 90;
    let needsRebuild = false;

    if (state.rotation !== rotation) needsRebuild = true;
    if (building.type === 'sorter') {
      const sorter = building as Sorter;
      if (state.filterProp !== sorter.filterProperty || state.filterVal !== sorter.filterValue) {
        needsRebuild = true;
      }
    }
    if (building.type === 'receiver') {
      const receiver = building as Receiver;
      if (state.requestName !== receiver.request.name) {
        needsRebuild = true;
      }
    }

    if (needsRebuild) {
      // Clear and recreate children
      for (let i = node.children.length - 1; i >= 0; i--) {
        node.children[i].destroy();
      }
      this._applyBuildingState(building, node as GroupNode);
    }
  }

  private _applyBuildingState(building: Building, group: GroupNode): void {
    const x = building.x * CELL_SIZE;
    const y = building.y * CELL_SIZE;
    const centerX = x + CELL_SIZE / 2;
    const centerY = y + CELL_SIZE / 2;
    const rotation = ((building.direction ?? 1) - 1) * 90;
    const state = (group as any)._buildingState;

    // Icon
    const def = registry.getAllBuildings().find(d => d.type === building.type);
    if (def?.iconPath) {
      const icon = new SpriteNode();
      icon.href = def.iconPath;
      icon.imgX = x + 4;
      icon.imgY = y + 4;
      icon.width = CELL_SIZE - 8;
      icon.height = CELL_SIZE - 8;
      icon.imgRotation = rotation;
      icon.imgPivotX = centerX;
      icon.imgPivotY = centerY;
      group.addChild(icon);
    }

    // Sorter overlay
    if (building.type === 'sorter') {
      const sorter = building as Sorter;

      const inPort = new ShapeNode('polygon');
      inPort.points = `${centerX - 6},${y + 2} ${centerX + 6},${y + 2} ${centerX},${y + 10}`;
      inPort.fill = '#ff9900';
      inPort.x = 0;
      inPort.y = 0;
      inPort.rotation = rotation + 180;
      inPort.pivotX = centerX;
      inPort.pivotY = centerY;
      inPort.opacity = 0.85;
      group.addChild(inPort);

      const outPort = new ShapeNode('polygon');
      outPort.points = `${centerX - 6},${y + 2} ${centerX + 6},${y + 2} ${centerX},${y + 10}`;
      outPort.fill = '#44ff88';
      outPort.x = 0;
      outPort.y = 0;
      outPort.rotation = rotation;
      outPort.pivotX = centerX;
      outPort.pivotY = centerY;
      outPort.opacity = 0.85;
      group.addChild(outPort);

      const label = new TextNode();
      label.textX = centerX;
      label.textY = y + CELL_SIZE - 2;
      label.textAnchor = 'middle';
      label.fontSize = '9';
      label.fontFamily = 'sans-serif';
      label.fill = sorter.filterProperty ? '#ffffff' : '#ffcc44';
      label.stroke = '#000';
      label.strokeWidth = 2;
      label.paintOrder = 'stroke';
      label.text = sorter.filterProperty ? `${sorter.filterProperty}:${sorter.filterValue}` : 'any';
      group.addChild(label);

      state.filterProp = sorter.filterProperty;
      state.filterVal = sorter.filterValue;
    }

    // Receiver overlay
    if (building.type === 'receiver') {
      const receiver = building as Receiver;
      const label = new TextNode();
      label.textX = centerX;
      label.textY = y + CELL_SIZE - 2;
      label.textAnchor = 'middle';
      label.fontSize = '9';
      label.fontFamily = 'sans-serif';
      label.fill = '#44ff44';
      label.stroke = '#000';
      label.strokeWidth = 2;
      label.paintOrder = 'stroke';
      label.text = receiver.request.name;
      group.addChild(label);

      state.requestName = receiver.request.name;
    }

    state.rotation = rotation;
  }

  // ── Items ─────────────────────────────────────────────────────────

  syncItems(world: WorldState, dyingItems?: Map<string, ItemInstance>): void {
    // Merge living + dying into a combined map for diffing
    const combined = new Map<string, ItemInstance>(world.items);
    if (dyingItems) {
      for (const [key, item] of dyingItems) {
        if (!combined.has(key)) {
          combined.set(key, item);
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

    const x = px;
    const y = py;
    const isErase = buildingId === 'erase';
    const def = isErase ? null : registry.getBuilding(buildingId);

    const key = gridKey(x, y);
    const isOccupied = world.buildings.has(key);

    let isInvalidStatic = false;
    if (def?.preferredStaticTypes && def.preferredStaticTypes.length > 0) {
      const staticObj = world.staticObjects.get(key);
      if (!staticObj || !def.preferredStaticTypes.includes(staticObj.type)) {
        isInvalidStatic = true;
      }
    }
    const isInvalid = isOccupied || isInvalidStatic;

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
    this.syncBuildings(world);
    this.syncItems(world, dyingItems);
    this.syncPreview(view, world);
    this.scene.syncAllDOM();
  }
}
