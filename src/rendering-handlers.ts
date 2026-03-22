import type { Building, BuildingType, WorldState, Emitter, Receiver, Scanner, Arm, Button, Lamp, Splitter, Merger } from './types.ts';
import { CELL_SIZE } from './types.ts';
import * as TWEEN from '@tweenjs/tween.js';
import type { GroupNode } from './scene.ts';
import { SpriteNode, ShapeNode, TextNode, InlineSvgNode } from './scene.ts';
import { buildingsRegistry as registry, propertyRegistry } from './registry.ts';
import { getDirectionOffset, gridKey } from './world.ts';
import armInlineSvg from './assets/arm.inline.svg?raw';
import { openEmitterDialog, openScannerDialog, openReceiverDialog } from './dialogs.ts';

// ---------------------------------------------------------------------------
// Abstract base handler — one instance per building in the world
// ---------------------------------------------------------------------------

export abstract class BuildingRenderHandler<T extends Building> {
  protected _building!: T;
  protected _rotation = 0;

  /**
   * Initializes common state from the building.
   * Concrete handlers should call this at the start of `applyState`.
   * Also used by `needsRebuild` to detect rotation changes.
   */
  protected _updateState(building: T): void {
    this._building = building;
    this._rotation = ((building.direction ?? 1) - 1) * 90;
  }

  abstract applyState(world: WorldState, building: T, group: GroupNode): void;

  needsRebuild(_world: WorldState, building: T): boolean {
    const oldRotation = this._rotation;
    this._updateState(building);
    return oldRotation !== this._rotation;
  }

  syncAnimation(
    _world: WorldState,
    _group: GroupNode,
  ): void {
    // default: no animation
  }

  onRemove(): void {
    // default: no cleanup
  }

  openDialog(
    _world: WorldState,
    _onClose?: () => void,
  ): void {
    // default: no dialog
  }

  createPopupContent(
    _world: WorldState,
  ): string | null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function applySpriteIcon(
  building: Building,
  group: GroupNode,
  href: string,
): SpriteNode {
  const x = building.x * CELL_SIZE;
  const y = building.y * CELL_SIZE;
  const centerX = x + CELL_SIZE / 2;
  const centerY = y + CELL_SIZE / 2;
  const rotation = ((building.direction ?? 1) - 1) * 90;

  const icon = new SpriteNode();
  icon.href = href;
  icon.imgX = x + 4;
  icon.imgY = y + 4;
  icon.width = CELL_SIZE - 8;
  icon.height = CELL_SIZE - 8;
  icon.imgRotation = rotation;
  icon.imgPivotX = centerX;
  icon.imgPivotY = centerY;
  group.addChild(icon);
  return icon;
}

function getIconPath(type: BuildingType): string | undefined {
  return registry.getAllBuildings().find(d => d.type === type)?.iconPath;
}

// ---------------------------------------------------------------------------
// Concrete handlers
// ---------------------------------------------------------------------------

class DefaultBuildingRenderHandler extends BuildingRenderHandler<Building> {
  applyState(_world: WorldState, building: Building, group: GroupNode): void {
    const href = getIconPath(building.type);
    if (href) applySpriteIcon(building, group, href);
    this._updateState(building);
  }
}

class EmitterRenderHandler extends BuildingRenderHandler<Emitter> {
  applyState(_world: WorldState, building: Emitter, group: GroupNode): void {
    const href = getIconPath(building.type);
    if (href) applySpriteIcon(building, group, href);
    this._updateState(building);
  }

  openDialog(_world: WorldState, onClose?: () => void): void {
    openEmitterDialog(this._building, onClose);
  }
}

class ReceiverRenderHandler extends BuildingRenderHandler<Receiver> {
  private _requestName = '';

  applyState(_world: WorldState, building: Receiver, group: GroupNode): void {
    const href = getIconPath(building.type);
    if (href) applySpriteIcon(building, group, href);

    const x = building.x * CELL_SIZE;
    const y = building.y * CELL_SIZE;
    const centerX = x + CELL_SIZE / 2;

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
    label.text = building.request.name;
    group.addChild(label);

    this._updateState(building);
    this._requestName = building.request.name;
  }

  needsRebuild(world: WorldState, building: Receiver): boolean {
    return super.needsRebuild(world, building) || this._requestName !== building.request.name;
  }

  openDialog(world: WorldState, onClose?: () => void): void {
    openReceiverDialog(this._building, world, onClose);
  }

  createPopupContent(_world: WorldState): string | null {
    const request = this._building.request;
    let content = `<h3>${request.name}</h3>`;

    for (const [prop, condition] of Object.entries(request.properties)) {
      let valStr: string;
      if (prop === 'color') {
        valStr = condition.map(c => {
          const val = propertyRegistry.getValue('color', c);
          return `<span class="color-swatch" style="background-color: ${val}"></span>${c}`;
        }).join(', ');
      } else {
        valStr = condition.join(', ');
      }
      content += `<div class="prop"><span class="prop-label">${prop}:</span><span>${valStr}</span></div>`;
    }

    if (Object.keys(request.properties).length === 0) {
      content += `<div class="prop"><span class="prop-label">Condition:</span><span>Any item</span></div>`;
    }

    content += `<div class="reward-info">Reward: $${request.cost} | Penalty: $${request.penalty}</div>`;
    return content;
  }
}

class ScannerRenderHandler extends BuildingRenderHandler<Scanner> {
  applyState(_world: WorldState, building: Scanner, group: GroupNode): void {
    const href = getIconPath(building.type);
    if (href) applySpriteIcon(building, group, href);
    this._updateState(building);
  }

  openDialog(_world: WorldState, onClose?: () => void): void {
    openScannerDialog(this._building, onClose);
  }
}

class ArmRenderHandler extends BuildingRenderHandler<Arm> {
  private static readonly ANIM_MS = 380;
  private _icon?: InlineSvgNode;
  private _armPart?: SVGGraphicsElement;
  private _tween?: TWEEN.Tween<{ angle: number }>;

  applyState(_world: WorldState, building: Arm, group: GroupNode): void {
    const x = building.x * CELL_SIZE;
    const y = building.y * CELL_SIZE;
    const centerX = x + CELL_SIZE / 2;
    const centerY = y + CELL_SIZE / 2;
    const rotation = ((building.direction ?? 1) - 1) * 90;

    const icon = new InlineSvgNode();
    icon.svgSource = armInlineSvg;
    icon.svgX = x + 4;
    icon.svgY = y + 4;
    icon.width = CELL_SIZE - 8;
    icon.height = CELL_SIZE - 8;
    icon.rotation = rotation;
    icon.pivotX = centerX;
    icon.pivotY = centerY;
    group.addChild(icon);

    this._updateState(building);
    this._icon = icon;
    this._armPart = icon.getElementByOriginalId('robotic-arm') ?? undefined;
  }

  syncAnimation(world: WorldState, _group: GroupNode): void {
    const isPowered = world.signals.get(gridKey(this._building.x, this._building.y)) === true;
    const icon = this._icon;
    if (!icon) return;

    if (!isPowered) {
      this._stopTween();
      this._setArmPartRotation(this._resolveArmPart(icon), 0);
      return;
    }

    if (this._tween) return; // already animating

    const tweenState = { angle: 0 };
    const tween = new TWEEN.Tween(tweenState)
      .to({ angle: 180 }, ArmRenderHandler.ANIM_MS)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .yoyo(true)
      .repeat(Infinity)
      .onUpdate(() => {
        this._setArmPartRotation(this._resolveArmPart(icon), tweenState.angle);
      })
      .start();
    this._tween = tween;
  }

  onRemove(): void {
    this._stopTween();
  }

  private _stopTween(): void {
    if (this._tween) {
      this._tween.stop();
      this._tween = undefined;
    }
  }

  private _resolveArmPart(icon: InlineSvgNode): SVGGraphicsElement | undefined {
    if (!this._armPart) {
      this._armPart = icon.getElementByOriginalId('robotic-arm') ?? undefined;
    }
    return this._armPart;
  }

  private _setArmPartRotation(
    armPart: SVGGraphicsElement | undefined,
    angle: number,
  ): void {
    if (!armPart) return;
    if (angle === 0) {
      armPart.removeAttribute('transform');
      return;
    }
    armPart.setAttribute('transform', `rotate(${angle} 50 50)`);
  }
}

class ButtonRenderHandler extends BuildingRenderHandler<Button> {
  private _isOn?: boolean;

  applyState(_world: WorldState, building: Button, group: GroupNode): void {
    const href = building.isOn ? '/icons/button-on.svg' : '/icons/button-off.svg';
    applySpriteIcon(building, group, href);
    this._updateState(building);
    this._isOn = building.isOn;
  }

  needsRebuild(world: WorldState, building: Button): boolean {
    return super.needsRebuild(world, building) || this._isOn !== building.isOn;
  }
}

class LampRenderHandler extends BuildingRenderHandler<Lamp> {
  private _isPowered?: boolean;

  applyState(world: WorldState, building: Lamp, group: GroupNode): void {
    const isPowered = world.signals.get(gridKey(building.x, building.y)) === true;
    const href = isPowered ? '/icons/lamp-on.svg' : '/icons/lamp-off.svg';
    applySpriteIcon(building, group, href);
    this._updateState(building);
    this._isPowered = isPowered;
  }

  needsRebuild(world: WorldState, building: Lamp): boolean {
    return super.needsRebuild(world, building)
      || this._isPowered !== (world.signals.get(gridKey(building.x, building.y)) === true);
  }
}

class SplitterRenderHandler extends BuildingRenderHandler<Splitter> {
  applyState(_world: WorldState, building: Splitter, group: GroupNode): void {
    this._updateState(building);
    const def = registry.getAllBuildings().find(d => d.type === building.type);

    if (def?.iconPath) {
      const { dx, dy } = getDirectionOffset(building.direction);
      // Secondary cell is perpendicular-right of anchor: (x-dy, y+dx)
      const spanCenterX = (building.x + 0.5 - 0.5 * dy) * CELL_SIZE;
      const spanCenterY = (building.y + 0.5 + 0.5 * dx) * CELL_SIZE;
      const splitterRotation = (building.direction - 1) * 90;

      const icon = new SpriteNode();
      icon.href = def.iconPath;
      icon.width = CELL_SIZE - 8;
      icon.height = 2 * CELL_SIZE - 8;
      icon.imgX = spanCenterX - (CELL_SIZE - 8) / 2;
      icon.imgY = spanCenterY - (2 * CELL_SIZE - 8) / 2;
      icon.imgRotation = splitterRotation;
      icon.imgPivotX = spanCenterX;
      icon.imgPivotY = spanCenterY;
      group.addChild(icon);

      // Debug port circles
      // Green: input port — one step behind secondary cell: (x-dy-dx, y+dx-dy)
      const inputCircle = new ShapeNode('circle');
      inputCircle.x = (building.x - dy - dx) * CELL_SIZE + CELL_SIZE / 2;
      inputCircle.y = (building.y + dx - dy) * CELL_SIZE + CELL_SIZE / 2;
      inputCircle.size = 12;
      inputCircle.fill = '#22c55e';
      inputCircle.fillOpacity = 0.85;
      inputCircle.stroke = '#166534';
      inputCircle.strokeWidth = 2;
      group.addChild(inputCircle);

      // Red: output1 port (ahead of anchor)
      const out1Circle = new ShapeNode('circle');
      out1Circle.x = (building.x + dx) * CELL_SIZE + CELL_SIZE / 2;
      out1Circle.y = (building.y + dy) * CELL_SIZE + CELL_SIZE / 2;
      out1Circle.size = 12;
      out1Circle.fill = '#ef4444';
      out1Circle.fillOpacity = 0.85;
      out1Circle.stroke = '#7f1d1d';
      out1Circle.strokeWidth = 2;
      group.addChild(out1Circle);

      // Red: output2 port (ahead of secondary cell)
      const out2Circle = new ShapeNode('circle');
      out2Circle.x = (building.x + dx - dy) * CELL_SIZE + CELL_SIZE / 2;
      out2Circle.y = (building.y + dy + dx) * CELL_SIZE + CELL_SIZE / 2;
      out2Circle.size = 12;
      out2Circle.fill = '#ef4444';
      out2Circle.fillOpacity = 0.85;
      out2Circle.stroke = '#7f1d1d';
      out2Circle.strokeWidth = 2;
      group.addChild(out2Circle);
    }
  }
}

class MergerRenderHandler extends BuildingRenderHandler<Merger> {
  applyState(_world: WorldState, building: Merger, group: GroupNode): void {
    this._updateState(building);
    const def = registry.getAllBuildings().find(d => d.type === building.type);

    if (def?.iconPath) {
      const { dx, dy } = getDirectionOffset(building.direction);
      // Secondary cell is perpendicular-right of anchor: (x-dy, y+dx)
      const spanCenterX = (building.x + 0.5 - 0.5 * dy) * CELL_SIZE;
      const spanCenterY = (building.y + 0.5 + 0.5 * dx) * CELL_SIZE;
      const mergerRotation = (building.direction - 1) * 90;

      const icon = new SpriteNode();
      icon.href = def.iconPath;
      icon.width = CELL_SIZE - 8;
      icon.height = 2 * CELL_SIZE - 8;
      icon.imgX = spanCenterX - (CELL_SIZE - 8) / 2;
      icon.imgY = spanCenterY - (2 * CELL_SIZE - 8) / 2;
      icon.imgRotation = mergerRotation;
      icon.imgPivotX = spanCenterX;
      icon.imgPivotY = spanCenterY;
      group.addChild(icon);

      // Green: input1 port — behind anchor cell
      const in1Circle = new ShapeNode('circle');
      in1Circle.x = (building.x - dx) * CELL_SIZE + CELL_SIZE / 2;
      in1Circle.y = (building.y - dy) * CELL_SIZE + CELL_SIZE / 2;
      in1Circle.size = 12;
      in1Circle.fill = '#22c55e';
      in1Circle.fillOpacity = 0.85;
      in1Circle.stroke = '#166534';
      in1Circle.strokeWidth = 2;
      group.addChild(in1Circle);

      // Green: input2 port — behind secondary cell
      const in2Circle = new ShapeNode('circle');
      in2Circle.x = (building.x - dx - dy) * CELL_SIZE + CELL_SIZE / 2;
      in2Circle.y = (building.y - dy + dx) * CELL_SIZE + CELL_SIZE / 2;
      in2Circle.size = 12;
      in2Circle.fill = '#22c55e';
      in2Circle.fillOpacity = 0.85;
      in2Circle.stroke = '#166534';
      in2Circle.strokeWidth = 2;
      group.addChild(in2Circle);

      // Red: output port — ahead of secondary cell
      const outCircle = new ShapeNode('circle');
      outCircle.x = (building.x + dx - dy) * CELL_SIZE + CELL_SIZE / 2;
      outCircle.y = (building.y + dy + dx) * CELL_SIZE + CELL_SIZE / 2;
      outCircle.size = 12;
      outCircle.fill = '#ef4444';
      outCircle.fillOpacity = 0.85;
      outCircle.stroke = '#7f1d1d';
      outCircle.strokeWidth = 2;
      group.addChild(outCircle);
    }
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

type HandlerFactory = () => BuildingRenderHandler<Building>;

const buildingHandlerFactories = new Map<BuildingType, HandlerFactory>([
  ['emitter',  () => new EmitterRenderHandler()],
  ['belt',     () => new DefaultBuildingRenderHandler()],
  ['receiver', () => new ReceiverRenderHandler()],
  ['scanner',  () => new ScannerRenderHandler()],
  ['arm',      () => new ArmRenderHandler()],
  ['button',   () => new ButtonRenderHandler()],
  ['lamp',     () => new LampRenderHandler()],
  ['splitter', () => new SplitterRenderHandler()],
  ['merger',   () => new MergerRenderHandler()],
]);

/** Create a fresh per-instance handler for a building placed in the world. */
export function createBuildingRenderHandler(type: BuildingType): BuildingRenderHandler<Building> | undefined {
  return buildingHandlerFactories.get(type)?.();
}
