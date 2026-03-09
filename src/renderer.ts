import type { ViewState, WorldState } from './types.ts';
import { registry } from './registry.ts';

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
  const def = registry.getBuilding(view.selectedBuildingId);

  // Check if position is occupied 
  const isOccupied = world ? world.buildings.has(`${x},${y}`) : false;
  const color = isOccupied ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 255, 0, 0.2)';
  const strokeColor = isOccupied ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 255, 0, 0.5)';

  const cellSizeVal = cellSize;
  const rotation = view.selectedDirection * 90;
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

  if (def && def.iconPath) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    icon.setAttributeNS('http://www.w3.org/1999/xlink', 'href', def.iconPath);
    icon.setAttribute('x', (x * cellSizeVal + 4).toString());
    icon.setAttribute('y', (y * cellSizeVal + 4).toString());
    icon.setAttribute('width', (cellSizeVal - 8).toString());
    icon.setAttribute('height', (cellSizeVal - 8).toString());
    icon.setAttribute('opacity', '0.6');
    icon.setAttribute('transform', `rotate(${rotation}, ${centerX}, ${centerY})`);
    group.appendChild(icon);
  }

  worldGroup.appendChild(group);
}

/**
 * Stub function to render buildings and items.
 */
export function renderWorld(world: WorldState, worldGroup: SVGGElement, view?: ViewState): void {
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
    const rotation = (building.direction ?? 1) * 90;
    
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
