import type { ViewState, WorldState } from './types.ts';

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
 * Stub function to render buildings and items.
 */
export function renderWorld(world: WorldState, _worldGroup: SVGGElement): void {
  // Placeholder for rendering existing buildings/items
  // The building/item rendering logic will be implemented in Phase 2 & 3.
  console.log('Rendering world at tick:', world.tick);
}
