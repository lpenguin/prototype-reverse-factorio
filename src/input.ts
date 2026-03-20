import type { ViewState, WorldState, Direction, Building, ItemInstance, Sorter, Receiver } from './types.ts';
import { CELL_SIZE } from './types.ts';
import { renderGridLines, updateTransform, renderWorld, updateRequestPopup, openSorterDialog, openReceiverDialog, renderRequestRepository } from './renderer.ts';
import { placeBuilding, gridKey, removeItem } from './world.ts';
import { buildingsRegistry as registry, requestRegistry } from './registry.ts';
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
  let isPainting = false;
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
      x: Math.floor(x / CELL_SIZE),
      y: Math.floor(y / CELL_SIZE)
    };
  };

  const tryErase = (coords: { x: number; y: number }) => {
    const removed = world.buildings.delete(gridKey(coords.x, coords.y));
    if (removed) {
      updateDisplay();
    }
  };

  const tryPlace = (coords: { x: number; y: number }) => {
    if (!viewState.selectedBuildingId || viewState.selectedBuildingId === 'erase') return;
    const def = registry.getBuilding(viewState.selectedBuildingId);
    if (!def) return;

    const newBuilding: Building = {
      type: def.type,
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
      const coords = getGridCoords(e.clientX, e.clientY);
      
      // Update preview immediately on click
      if (viewState.selectedBuildingId) {
        viewState.previewCoords = coords;
      }

      if (e.shiftKey && viewState.selectedBuildingId) {
        isPainting = true;
        svgElement.setPointerCapture(e.pointerId);
        if (viewState.selectedBuildingId === 'erase') {
          tryErase(coords);
        } else {
          tryPlace(coords);
        }
      } else if (viewState.selectedBuildingId === 'erase') {
        tryErase(coords);
      } else if (viewState.selectedBuildingId) {
        tryPlace(coords);
      } else {
        // No tool selected — check if we clicked a sorter or receiver to open its dialog
        const clickedBuilding = world.buildings.get(gridKey(coords.x, coords.y));
        if (clickedBuilding?.type === 'sorter') {
          openSorterDialog(clickedBuilding as Sorter, () => updateDisplay());
        } else if (clickedBuilding?.type === 'receiver') {
          openReceiverDialog(clickedBuilding as Receiver, world, () => updateDisplay());
        } else {
          isPanning = true;
          lastX = e.clientX;
          lastY = e.clientY;
          svgElement.setPointerCapture(e.pointerId);
        }
      }
      updateDisplay();
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

  // New Request button handling
  const newRequestBtn = document.querySelector('#new-request-btn');
  if (newRequestBtn) {
    newRequestBtn.addEventListener('click', () => {
      const newReq = requestRegistry.generateRandomRequest();
      world.requests.push(newReq);
      renderRequestRepository(world);
    });
  }

  svgElement.addEventListener('contextmenu', (e) => e.preventDefault());

  svgElement.addEventListener('pointermove', (e) => {
    const coords = getGridCoords(e.clientX, e.clientY);

    // Update preview coords whenever a tool is selected
    if (viewState.selectedBuildingId) {
      if (!viewState.previewCoords || viewState.previewCoords.x !== coords.x || viewState.previewCoords.y !== coords.y) {
        viewState.previewCoords = coords;
        updateDisplay();
      }
    }

    if (isPainting) {
      if (viewState.selectedBuildingId === 'erase') {
        tryErase(coords);
      } else {
        tryPlace(coords);
      }
    } else if (isPanning) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      viewState.panX += dx;
      viewState.panY += dy;
      lastX = e.clientX;
      lastY = e.clientY;
      updateDisplay();
    }

    // Update hover popup
    updateRequestPopup(world, coords.x, coords.y, e.clientX, e.clientY);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelSelection();
    }
  });

  svgElement.addEventListener('pointerup', (e) => {
    if (isPainting) {
      isPainting = false;
      svgElement.releasePointerCapture(e.pointerId);
    } else if (isPanning) {
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
