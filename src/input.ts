import type { ViewState, WorldState, Direction, Building, ItemInstance } from './types.ts';
import { CELL_SIZE } from './types.ts';
import { updateTransform, updateRequestPopup, renderRequestRepository } from './renderer.ts';
import { addWireCells, getOrthogonalDragCells, placeBuilding, gridKey, removeItem, removeBuilding } from './world.ts';
import { buildingsRegistry as registry, requestRegistry } from './registry.ts';
import { getHandler } from './simulation.ts';
import type { WorldRenderer } from './world-renderer.ts';

const DEFAULT_EMITTER_SEQUENCE = [{ shape: 'circle', color: 'red' }] as const;

export function setupInput(
  svgElement: SVGSVGElement,
  worldGroup: SVGGElement,
  _gridGroup: SVGGElement,
  viewState: ViewState,
  world: WorldState,
  dyingItems: Map<string, ItemInstance>,
  worldRenderer: WorldRenderer,
): void {
  let isPanning = false;
  let isPainting = false;
  let isWireDragging = false;
  let wireStartCoords: { x: number; y: number } | null = null;
  let lastX = 0;
  let lastY = 0;

  const updateDisplay = () => {
    updateTransform(worldGroup, viewState);
    worldRenderer.renderGridLines(viewState, svgElement.clientWidth, svgElement.clientHeight);
    worldRenderer.syncAll(world, viewState, dyingItems);
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
    const removed = removeBuilding(world, coords.x, coords.y);
    if (removed) {
      updateDisplay();
    }
  };

  const tryPlace = (coords: { x: number; y: number }) => {
    if (!viewState.selectedBuildingId || viewState.selectedBuildingId === 'erase' || viewState.selectedBuildingId === 'wire') return;
    const def = registry.getBuilding(viewState.selectedBuildingId);
    if (!def) return;

    const newBuilding: Building = def.type === 'emitter'
      ? {
          type: 'emitter',
          x: coords.x,
          y: coords.y,
          direction: viewState.selectedDirection,
          sequence: DEFAULT_EMITTER_SEQUENCE.map(item => ({ ...item })),
          nextSequenceIndex: 0,
        }
      : {
          type: def.type,
          x: coords.x,
          y: coords.y,
          direction: viewState.selectedDirection,
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
          dyingItems.set(item.id, item);
        }
      }
      updateDisplay();
    }
  };

  const cancelSelection = () => {
    viewState.selectedBuildingId = null;
    viewState.previewCoords = null;
    viewState.wirePreviewCells = [];
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
        if (viewState.selectedBuildingId === 'wire') {
          return;
        }
        isPainting = true;
        svgElement.setPointerCapture(e.pointerId);
        if (viewState.selectedBuildingId === 'erase') {
          tryErase(coords);
        } else {
          tryPlace(coords);
        }
      } else if (viewState.selectedBuildingId === 'erase') {
        tryErase(coords);
      } else if (viewState.selectedBuildingId === 'wire') {
        isWireDragging = true;
        wireStartCoords = coords;
        viewState.wirePreviewCells = [gridKey(coords.x, coords.y)];
        svgElement.setPointerCapture(e.pointerId);
      } else if (viewState.selectedBuildingId) {
        tryPlace(coords);
      } else {
        // No tool selected — check if we clicked a scanner/receiver/button to open its dialog
        const clickedBuilding = world.buildings.get(gridKey(coords.x, coords.y));
        if (clickedBuilding?.type === 'button') {
          clickedBuilding.isOn = !clickedBuilding.isOn;
          updateDisplay();
        } else if (clickedBuilding?.type === 'emitter') {
          worldRenderer.getBuildingHandler(gridKey(coords.x, coords.y))?.openDialog(world, () => updateDisplay());
        } else if (clickedBuilding?.type === 'scanner') {
          worldRenderer.getBuildingHandler(gridKey(coords.x, coords.y))?.openDialog(world, () => updateDisplay());
        } else if (clickedBuilding?.type === 'receiver') {
          worldRenderer.getBuildingHandler(gridKey(coords.x, coords.y))?.openDialog(world, () => updateDisplay());
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

    if (isWireDragging && wireStartCoords) {
      viewState.wirePreviewCells = getOrthogonalDragCells(wireStartCoords, coords);
      updateDisplay();
    } else if (isPainting) {
      if (viewState.selectedBuildingId === 'erase') {
        tryErase(coords);
      } else if (viewState.selectedBuildingId !== 'wire') {
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
    updateRequestPopup(world, worldRenderer, coords.x, coords.y, e.clientX, e.clientY);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelSelection();
    }
  });

  svgElement.addEventListener('pointerup', (e) => {
    if (isWireDragging) {
      const coords = getGridCoords(e.clientX, e.clientY);
      if (wireStartCoords) {
        const cells = getOrthogonalDragCells(wireStartCoords, coords);
        addWireCells(world, cells);
      }
      viewState.wirePreviewCells = [];
      isWireDragging = false;
      wireStartCoords = null;
      updateDisplay();
      svgElement.releasePointerCapture(e.pointerId);
    } else if (isPainting) {
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

    if (viewState.selectedBuildingId && viewState.selectedBuildingId !== 'erase' && viewState.selectedBuildingId !== 'wire') {
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
