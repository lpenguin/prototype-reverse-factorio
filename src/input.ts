import type { ViewState } from './types.ts';
import { renderGridLines, updateTransform } from './renderer.ts';

export function setupInput(
  svgElement: SVGSVGElement,
  worldGroup: SVGGElement,
  gridGroup: SVGGElement,
  viewState: ViewState
): void {
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  const updateDisplay = () => {
    updateTransform(worldGroup, viewState);
    renderGridLines(gridGroup, viewState, svgElement.clientWidth, svgElement.clientHeight);
  };

  // Pan interaction
  svgElement.addEventListener('pointerdown', (e) => {
    if (e.button === 0) { // Left-click only for panning background
      isPanning = true;
      lastX = e.clientX;
      lastY = e.clientY;
      svgElement.setPointerCapture(e.pointerId);
    }
  });

  svgElement.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    viewState.panX += dx;
    viewState.panY += dy;
    lastX = e.clientX;
    lastY = e.clientY;
    updateDisplay();
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
