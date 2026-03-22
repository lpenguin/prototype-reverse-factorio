import type { ViewState, WorldState, RequestDefinition } from './types.ts';
import { propertyRegistry, requestRegistry } from './registry.ts';
import { gridKey } from './world.ts';
import type { WorldRenderer } from './world-renderer.ts';

/**
 * Updates the main world <G> element's transform to reflect the view state.
 */
export function updateTransform(worldGroup: SVGGElement, view: ViewState): void {
  const { panX, panY, zoom } = view;
  worldGroup.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);
}

/**
 * Render the global request repository sidebar
 */
export function renderRequestRepository(world: WorldState): void {
  const container = document.querySelector('#request-list');
  if (!container) return;

  // Simple optimization: only re-render if count changed (can be more robust)
  if (container.children.length === world.requests.length + 1) return; // +1 for Any Item default

  container.innerHTML = '';
  
  // Always show default request
  const defaultReq = requestRegistry.getDefaultRequest();
  container.appendChild(createRequestCard(defaultReq));

  world.requests.forEach(req => {
    container.appendChild(createRequestCard(req));
  });
}

function createRequestCard(req: RequestDefinition): HTMLElement {
  const card = document.createElement('div');
  card.className = 'repo-request-card';
  
  let visualHtml = '<div class="repo-request-visuals">';
  for (const [prop, values] of Object.entries(req.properties)) {
    if (prop === 'color') {
      values.forEach(v => {
        const color = propertyRegistry.getValue('color', v);
        visualHtml += `<div class="repo-swatch" style="background-color: ${color}" title="Color: ${v}"></div>`;
      });
    } else if (prop === 'shape') {
      values.forEach(v => {
        if (v === 'triangle') {
          visualHtml += `<div class="repo-shape repo-shape-triangle" title="Shape: ${v}"></div>`;
        } else if (v === 'circle') {
          visualHtml += `<div class="repo-shape repo-shape-circle" title="Shape: ${v}"></div>`;
        } else {
          visualHtml += `<div class="repo-shape repo-shape-square" title="Shape: ${v}"></div>`;
        }
      });
    } else if (prop === 'size') {
      values.forEach(v => {
        visualHtml += `<div class="repo-size" title="Size: ${v}"></div>`;
      });
    }
  }
  visualHtml += '</div>';

  if (Object.keys(req.properties).length === 0) {
    visualHtml = '<div class="repo-request-visuals"><div class="repo-shape repo-shape-any" title="Any Item"></div></div>';
  }

  card.innerHTML = `
    <div class="repo-request-header">
      <div class="repo-request-name">${req.name}</div>
      ${visualHtml}
    </div>
    <div class="repo-request-reward">
      <span>$${req.cost}</span>
      <span style="color: #f66; font-size: 10px;">-$${req.penalty}</span>
    </div>
  `;
  return card;
}

/**
 * Update HUD with world state
 */
export function updateHUD(world: WorldState): void {
  const hud = document.querySelector('#hud');
  if (hud) hud.textContent = `Money: $${world.playerMoney} | Tick: ${world.tick}`;
}

/**
 * Show or hide the request popup based on hover
 */
export function updateRequestPopup(world: WorldState, worldRenderer: WorldRenderer, gridX: number, gridY: number, screenX: number, screenY: number): void {
  const popup = document.querySelector<HTMLDivElement>('#request-popup');
  if (!popup) return;

  const key = gridKey(gridX, gridY);
  const content = worldRenderer.getBuildingHandler(key)?.createPopupContent(world) ?? null;
  if (content !== null) {
    popup.innerHTML = content;
    popup.style.display = 'block';
    popup.style.left = `${screenX + 20}px`;
    popup.style.top = `${screenY + 20}px`;
    return;
  }

  popup.style.display = 'none';
}
