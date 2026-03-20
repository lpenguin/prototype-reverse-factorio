import type { ViewState, WorldState, Receiver, Sorter, RequestDefinition } from './types.ts';
import { propertyRegistry, requestRegistry } from './registry.ts';
import { gridKey } from './world.ts';

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
 * Open the sorter configuration dialog
 */
export function openSorterDialog(sorter: Sorter, onClose?: () => void): void {
  document.querySelector('#sorter-dialog')?.remove();

  const allProperties = propertyRegistry.getAllProperties();
  const dialog = document.createElement('div');
  dialog.id = 'sorter-dialog';

  const propertyOptions = allProperties.map(p =>
    `<option value="${p.id}" ${sorter.filterProperty === p.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  const currentProp = allProperties.find(p => p.id === sorter.filterProperty) ?? allProperties[0];
  const valueOptions = currentProp
    ? Object.keys(currentProp.values).map(v =>
        `<option value="${v}" ${sorter.filterValue === v ? 'selected' : ''}>${v}</option>`
      ).join('')
    : '';

  dialog.innerHTML = `
    <div class="sorter-dialog-header">
      <span>Sorter Filter</span>
      <button id="sorter-dialog-close" aria-label="Close">&times;</button>
    </div>
    <div class="sorter-dialog-body">
      <label>Property<select id="sorter-prop-select">${propertyOptions}</select></label>
      <label>Value<select id="sorter-val-select">${valueOptions}</select></label>
      <button id="sorter-clear-btn">Clear filter (pass all)</button>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.style.left = `${window.innerWidth / 2 - 120}px`;
  dialog.style.top  = `${window.innerHeight / 2 - 80}px`;

  const propSelect = dialog.querySelector<HTMLSelectElement>('#sorter-prop-select')!;
  const valSelect  = dialog.querySelector<HTMLSelectElement>('#sorter-val-select')!;

  propSelect.addEventListener('change', () => {
    sorter.filterProperty = propSelect.value;
    const propDef = allProperties.find(p => p.id === propSelect.value);
    if (propDef) {
      valSelect.innerHTML = Object.keys(propDef.values).map(v => `<option value="${v}">${v}</option>`).join('');
      sorter.filterValue = valSelect.value;
    }
  });

  valSelect.addEventListener('change', () => {
    sorter.filterValue = valSelect.value;
  });

  dialog.querySelector('#sorter-clear-btn')!.addEventListener('click', () => {
    sorter.filterProperty = undefined;
    sorter.filterValue = undefined;
    dialog.remove();
    onClose?.();
  });

  dialog.querySelector('#sorter-dialog-close')!.addEventListener('click', () => {
    dialog.remove();
    onClose?.();
  });
}

/**
 * Open the receiver request selection dialog
 */
export function openReceiverDialog(receiver: Receiver, world: WorldState, onClose?: () => void): void {
  document.querySelector('#sorter-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.id = 'sorter-dialog'; // Reuse style

  const allAvailable = [requestRegistry.getDefaultRequest(), ...world.requests];
  
  const itemsHtml = allAvailable.map(req => `
    <div class="receiver-dialog-item ${receiver.request.id === req.id ? 'selected' : ''}" data-id="${req.id}">
      <div style="font-weight:bold; color:#4f4">${req.name}</div>
      <div style="font-size:11px; color:#aaa">$${req.cost} reward</div>
    </div>
  `).join('');

  dialog.innerHTML = `
    <div class="sorter-dialog-header">
      <span>Select Request</span>
      <button id="sorter-dialog-close" aria-label="Close">&times;</button>
    </div>
    <div class="sorter-dialog-body" style="max-height: 300px; overflow-y: auto; padding:0;">
      ${itemsHtml}
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.style.left = `${window.innerWidth / 2 - 120}px`;
  dialog.style.top  = `${window.innerHeight / 2 - 150}px`;

  dialog.querySelectorAll('.receiver-dialog-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      const req = allAvailable.find(r => r.id === id);
      if (req) {
        receiver.request = req;
      }
      dialog.remove();
      onClose?.();
    });
  });

  dialog.querySelector('#sorter-dialog-close')!.addEventListener('click', () => {
    dialog.remove();
    onClose?.();
  });
}

/**
 * Show or hide the request popup based on hover
 */
export function updateRequestPopup(world: WorldState, gridX: number, gridY: number, screenX: number, screenY: number): void {
  const popup = document.querySelector<HTMLDivElement>('#request-popup');
  if (!popup) return;

  const key = gridKey(gridX, gridY);
  const building = world.buildings.get(key);

  if (building?.type === 'receiver') {
    const receiver = building as Receiver;
    const request = receiver.request;
    
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
    
    popup.innerHTML = content;
    popup.style.display = 'block';
    popup.style.left = `${screenX + 20}px`;
    popup.style.top = `${screenY + 20}px`;
    return;
  }

  popup.style.display = 'none';
}
