import type { ViewState, WorldState, ItemInstance } from './types.ts';
import { buildingsRegistry as registry } from './registry.ts';
import { itemRegistry } from './registry.ts';

/**
 * Re-render the infinite grid lines based on the current view box.
 */
export function renderGridLines(svgGrid: SVGGElement, view: ViewState, width: number, height: number): void {
  // Clear existing grid lines
  svgGrid.innerHTML = '';

  const { panX, panY, zoom, cellSize } = view;
  const scaledCellSize = cellSize * zoom;

  // Determine the coordinate range visible in the viewport
  const startX = Math.floor(-panX / scaledCellSize);
  const endX = Math.ceil((width - panX) / scaledCellSize);
  const startY = Math.floor(-panY / scaledCellSize);
  const endY = Math.ceil((height - panY) / scaledCellSize);

  // Vertical lines
  for (let x = startX; x <= endX; x++) {
    const lineX = x * scaledCellSize + panX;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', lineX.toString());
    line.setAttribute('y1', '0');
    line.setAttribute('x2', lineX.toString());
    line.setAttribute('y2', height.toString());
    line.setAttribute('stroke', '#ccc');
    line.setAttribute('stroke-width', '0.5');
    svgGrid.appendChild(line);
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y++) {
    const lineY = y * scaledCellSize + panY;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', lineY.toString());
    line.setAttribute('x2', width.toString());
    line.setAttribute('y2', lineY.toString());
    line.setAttribute('stroke', '#ccc');
    line.setAttribute('stroke-width', '0.5');
    svgGrid.appendChild(line);
  }
}

/**
 * Updates the main world <G> element's transform to reflect the view state.
 */
export function updateTransform(worldGroup: SVGGElement, view: ViewState): void {
  const { panX, panY, zoom } = view;
  worldGroup.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);
}

/**
 * Render a building ghost at the specified coordinates.
 */
function renderPreview(worldGroup: SVGGElement, view: ViewState, world?: WorldState): void {
  // Remove existing previews
  const existingPreview = worldGroup.querySelector('.building-preview');
  if (existingPreview) existingPreview.remove();

  if (!view.selectedBuildingId || !view.previewCoords) return;

  const { x, y } = view.previewCoords;
  const cellSize = view.cellSize;
  const isErase = view.selectedBuildingId === 'erase';
  const def = isErase ? null : registry.getBuilding(view.selectedBuildingId);

  // Check if position is occupied 
  const isOccupied = world ? world.buildings.has(`${x},${y}`) : false;
  
  let color, strokeColor;
  if (isErase) {
    color = isOccupied ? 'rgba(255, 0, 0, 0.4)' : 'rgba(100, 100, 100, 0.2)';
    strokeColor = isOccupied ? 'rgba(255, 0, 0, 0.8)' : 'rgba(100, 100, 100, 0.4)';
  } else {
    color = isOccupied ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 255, 0, 0.2)';
    strokeColor = isOccupied ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 255, 0, 0.5)';
  }

  const cellSizeVal = cellSize;
  const rotation = (view.selectedDirection - 1) * 90;
  const centerX = x * cellSizeVal + cellSizeVal / 2;
  const centerY = y * cellSizeVal + cellSizeVal / 2;

  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'building-preview');
  group.style.pointerEvents = 'none';

  const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  ghost.setAttribute('x', (x * cellSizeVal).toString());
  ghost.setAttribute('y', (y * cellSizeVal).toString());
  ghost.setAttribute('width', cellSizeVal.toString());
  ghost.setAttribute('height', cellSizeVal.toString());
  ghost.setAttribute('fill', color);
  ghost.setAttribute('stroke', strokeColor);
  ghost.setAttribute('stroke-width', '2');
  group.appendChild(ghost);

  const iconPath = isErase ? '/icons/erase.svg' : (def?.iconPath);
  if (iconPath) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    icon.setAttributeNS('http://www.w3.org/1999/xlink', 'href', iconPath);
    icon.setAttribute('x', (x * cellSizeVal + 4).toString());
    icon.setAttribute('y', (y * cellSizeVal + 4).toString());
    icon.setAttribute('width', (cellSizeVal - 8).toString());
    icon.setAttribute('height', (cellSizeVal - 8).toString());
    icon.setAttribute('opacity', '0.6');
    if (!isErase) {
      icon.setAttribute('transform', `rotate(${rotation}, ${centerX}, ${centerY})`);
    }
    group.appendChild(icon);
  }

  worldGroup.appendChild(group);
}

/**
 * Stub function to render buildings and items.
 */
export function renderWorld(world: WorldState, worldGroup: SVGGElement, view?: ViewState, dyingItems?: Map<string, ItemInstance>): void {
  // Static objects layer
  let staticLayer = worldGroup.querySelector('#static-layer') as SVGGElement;
  if (!staticLayer) {
    staticLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    staticLayer.id = 'static-layer';
    worldGroup.prepend(staticLayer);
  }
  staticLayer.innerHTML = '';

  world.staticObjects.forEach((obj) => {
    if (obj.type === 'garbage') {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const x = obj.x * 48;
      const y = obj.y * 48;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x.toString());
      rect.setAttribute('y', y.toString());
      rect.setAttribute('width', '48');
      rect.setAttribute('height', '48');
      rect.setAttribute('fill', '#a5a5a5');
      rect.setAttribute('fill-opacity', '0.4');
      g.appendChild(rect);

      // Deterministic "random" lines
      const seed = (obj.x * 374761393 + obj.y * 668265263) ^ 0x9e3779b9;
      const pseudoRandom = (s: number) => {
        const val = Math.sin(s) * 10000;
        return val - Math.floor(val);
      };

      for (let i = 0; i < 4; i++) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const lx1 = x + pseudoRandom(seed + i * 10) * 48;
        const ly1 = y + pseudoRandom(seed + i * 10 + 1) * 48;
        const lx2 = x + pseudoRandom(seed + i * 10 + 2) * 48;
        const ly2 = y + pseudoRandom(seed + i * 10 + 3) * 48;
        line.setAttribute('x1', lx1.toString());
        line.setAttribute('y1', ly1.toString());
        line.setAttribute('x2', lx2.toString());
        line.setAttribute('y2', ly2.toString());
        line.setAttribute('stroke', '#666');
        line.setAttribute('stroke-width', '1.5');
        g.appendChild(line);
      }
      staticLayer.appendChild(g);
    }
  });

  // Buildings layer
  // Clear buildings (except grid and preview for now, but we'll manage it better)
  let layer = worldGroup.querySelector('#buildings-layer') as SVGGElement;
  if (!layer) {
    layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.id = 'buildings-layer';
    worldGroup.appendChild(layer);
  }
  layer.innerHTML = '';
  
  world.buildings.forEach((building) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const x = building.x * 48;
    const y = building.y * 48;
    const centerX = x + 24;
    const centerY = y + 24;
    const rotation = ((building.direction ?? 1) - 1) * 90;

    // Icon
    const def = registry.getAllBuildings().find(d => d.type === building.type);
    if (def && def.iconPath) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      icon.setAttributeNS('http://www.w3.org/1999/xlink', 'href', def.iconPath);
      icon.setAttribute('x', (x + 4).toString());
      icon.setAttribute('y', (y + 4).toString());
      icon.setAttribute('width', '40');
      icon.setAttribute('height', '40');
      icon.setAttribute('transform', `rotate(${rotation}, ${centerX}, ${centerY})`);
      g.appendChild(icon);
    }

    layer.appendChild(g);
  });

  // Items layer
  let itemsLayer = worldGroup.querySelector('#items-layer') as SVGGElement;
  if (!itemsLayer) {
    itemsLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    itemsLayer.id = 'items-layer';
    worldGroup.appendChild(itemsLayer);
  }
  itemsLayer.innerHTML = '';

  const renderItem = (item: ItemInstance) => {
    const cx = item.renderX * 48 + 24;
    const cy = item.renderY * 48 + 24;
    const def = itemRegistry.getItem(item.defId);
    if (!def) return;
    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', def.iconPath);
    img.setAttribute('x', '-12');
    img.setAttribute('y', '-12');
    img.setAttribute('width', '24');
    img.setAttribute('height', '24');
    img.setAttribute('transform', `translate(${cx},${cy}) scale(${item.renderScale})`);
    itemsLayer.appendChild(img);
  };

  world.items.forEach(renderItem);
  dyingItems?.forEach(renderItem);

  if (view) {
    renderPreview(worldGroup, view, world);
  }
}

/**
 * Update HUD with world state
 */
export function updateHUD(world: WorldState): void {
  const hud = document.querySelector('#hud');
  if (hud) hud.textContent = `Money: $${world.playerMoney} | Tick: ${world.tick}`;
}
