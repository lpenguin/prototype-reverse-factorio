import type { ViewState, WorldState, Direction, Building, ItemInstance } from './types.ts';
import { renderGridLines, updateTransform, renderWorld } from './renderer.ts';
import { placeBuilding, gridKey, removeItem } from './world.ts';
import { buildingsRegistry as registry } from './registry.ts';
import { getHandler } from './simulation.ts';

export function setupInput(
  svgElement: SVGSVGElement,
  worldGroup: SVGGElement,
  gridGroup: SVGGElement,
  viewState: ViewState,
  world: WorldState,
  dyingItems: Map<string, ItemInstance>,
): void {
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  const updateDisplay = () => {
    updateTransform(worldGroup, viewState);
    renderGridLines(gridGroup, viewState, svgElement.clientWidth, svgElement.clientHeight);
    renderWorld(world, worldGroup, viewState);
  };

  const getGridCoords = (clientX: number, clientY: number) => {
    const rect = svgElement.getBoundingClientRect();
    const x = (clientX - rect.left - viewState.panX) / viewState.zoom;
    const y = (clientY - rect.top - viewState.panY) / viewState.zoom;
    return {
      x: Math.floor(x / viewState.cellSize),
      y: Math.floor(y / viewState.cellSize)
    };
  };

  const cancelSelection = () => {
    viewState.selectedBuildingId = null;
    viewState.previewCoords = null;
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
    updateDisplay();
  };

  const cycleDirection = (reverse: boolean = false) => {
    if (reverse) {
      viewState.selectedDirection = ((viewState.selectedDirection + 3) % 4) as Direction;
    } else {
      viewState.selectedDirection = ((viewState.selectedDirection + 1) % 4) as Direction;
    }
    updateDisplay();
  };

  // Interaction
  svgElement.addEventListener('pointerdown', (e) => {
    if (e.button === 0) { // Left-click
      if (viewState.selectedBuildingId === 'erase') {
        const coords = getGridCoords(e.clientX, e.clientY);
        const removed = world.buildings.delete(gridKey(coords.x, coords.y));
        if (removed) {
          updateDisplay();
        }
      } else if (viewState.selectedBuildingId) {
        // Place building
        const coords = getGridCoords(e.clientX, e.clientY);
        const def = registry.getBuilding(viewState.selectedBuildingId);
        if (def) {
          const newBuilding: Building = {
            type: def.type as any,
            x: coords.x,
            y: coords.y,
            direction: viewState.selectedDirection,
            ...(def.type === 'emitter' ? { itemPool: def.itemPool ?? [] } : {})
          } as Building;
          
          if (placeBuilding(world, newBuilding)) {
            // If there's an item at the placed cell, let the building consume it
            const item = world.items.get(gridKey(newBuilding.x, newBuilding.y));
            if (item) {
              const handler = getHandler(newBuilding.type);
              if (handler && handler.accept(world, newBuilding as never, item)) {
                item.x = newBuilding.x;
                item.y = newBuilding.y;
                removeItem(world, newBuilding.x, newBuilding.y);
                dyingItems.set(gridKey(newBuilding.x, newBuilding.y), item);
              }
            }
            updateDisplay();
          }
        }
      } else {
        isPanning = true;
        lastX = e.clientX;
        lastY = e.clientY;
        svgElement.setPointerCapture(e.pointerId);
      }
    } else if (e.button === 2) { // Right-click
      const coords = getGridCoords(e.clientX, e.clientY);
      const key = `${coords.x},${coords.y}`;
      const existing = world.buildings.get(key);

      if (existing) {
        // Rotate placed building
        existing.direction = ((existing.direction + 1) % 4) as Direction;
        viewState.selectedDirection = existing.direction; // sync last placed
        updateDisplay();
      } else {
        cancelSelection();
      }
    }
  });

  svgElement.addEventListener('contextmenu', (e) => e.preventDefault());

  svgElement.addEventListener('pointermove', (e) => {
    if (isPanning) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      viewState.panX += dx;
      viewState.panY += dy;
      lastX = e.clientX;
      lastY = e.clientY;
      updateDisplay();
    } else if (viewState.selectedBuildingId) {
      const coords = getGridCoords(e.clientX, e.clientY);
      if (!viewState.previewCoords || viewState.previewCoords.x !== coords.x || viewState.previewCoords.y !== coords.y) {
        viewState.previewCoords = coords;
        updateDisplay();
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelSelection();
    }
  });

  svgElement.addEventListener('pointerup', (e) => {
    if (isPanning) {
      isPanning = false;
      svgElement.releasePointerCapture(e.pointerId);
    }
  });

  // Zoom interaction
  svgElement.addEventListener('wheel', (e) => {
    e.preventDefault();

    if (viewState.selectedBuildingId) {
      // Rotate building instead of zooming when a building is selected
      cycleDirection(e.deltaY > 0);
      return;
    }

    const zoomSpeed = 0.001;
    const scrollDelta = -e.deltaY;
    const oldZoom = viewState.zoom;
    const newZoom = Math.min(Math.max(viewState.zoom + scrollDelta * zoomSpeed, 0.2), 5); // Clamped zoom

    if (oldZoom === newZoom) return;

    // Zoom centered on cursor position:
    // (mouseX - panX) / oldZoom = (mouseX - newPanX) / newZoom
    // newPanX = mouseX - (mouseX - panX) * (newZoom / oldZoom)
    const rect = svgElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    viewState.panX = mouseX - (mouseX - viewState.panX) * (newZoom / oldZoom);
    viewState.panY = mouseY - (mouseY - viewState.panY) * (newZoom / oldZoom);
    viewState.zoom = newZoom;

    updateDisplay();
  }, { passive: false });

  // Initial display
  updateDisplay();

  // Resize handling
  window.addEventListener('resize', () => {
    updateDisplay();
  });
}
