import type { ViewState, WorldState, ItemInstance, Receiver, Sorter } from './types.ts';
import { buildingsRegistry as registry, itemRegistry, propertyRegistry, requestRegistry } from './registry.ts';
import { gridKey } from './world.ts';

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
  const key = gridKey(x, y);
  const isOccupied = world ? world.buildings.has(key) : false;
  
  let isInvalidStatic = false;
  if (world && def?.preferredStaticTypes && def.preferredStaticTypes.length > 0) {
    const staticObj = world.staticObjects.get(key);
    if (!staticObj || !def.preferredStaticTypes.includes(staticObj.type)) {
      isInvalidStatic = true;
    }
  }

  const isInvalid = isOccupied || isInvalidStatic;

  let color, strokeColor;
  if (isErase) {
    color = isOccupied ? 'rgba(255, 0, 0, 0.4)' : 'rgba(100, 100, 100, 0.2)';
    strokeColor = isOccupied ? 'rgba(255, 0, 0, 0.8)' : 'rgba(100, 100, 100, 0.4)';
  } else {
    color = isInvalid ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 255, 0, 0.2)';
    strokeColor = isInvalid ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 255, 0, 0.5)';
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

    // Sorter overlay: input/output port markers + active filter label
    if (building.type === 'sorter') {
      const sorter = building as Sorter;

      // Input port marker (behind = opposite of facing): small orange triangle pointing in
      const inPort = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      inPort.setAttribute('points', `${centerX - 6},${y + 2} ${centerX + 6},${y + 2} ${centerX},${y + 10}`);
      inPort.setAttribute('fill', '#ff9900');
      inPort.setAttribute('opacity', '0.85');
      inPort.setAttribute('transform', `rotate(${rotation + 180}, ${centerX}, ${centerY})`);
      g.appendChild(inPort);

      // Output port marker (front = facing direction): small green triangle pointing out
      const outPort = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      outPort.setAttribute('points', `${centerX - 6},${y + 2} ${centerX + 6},${y + 2} ${centerX},${y + 10}`);
      outPort.setAttribute('fill', '#44ff88');
      outPort.setAttribute('opacity', '0.85');
      outPort.setAttribute('transform', `rotate(${rotation}, ${centerX}, ${centerY})`);
      g.appendChild(outPort);

      // Filter label below the icon
      if (sorter.filterProperty && sorter.filterValue) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', centerX.toString());
        label.setAttribute('y', (y + 46).toString());
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '9');
        label.setAttribute('font-family', 'sans-serif');
        label.setAttribute('fill', '#ffffff');
        label.setAttribute('stroke', '#000');
        label.setAttribute('stroke-width', '2');
        label.setAttribute('paint-order', 'stroke');
        label.textContent = `${sorter.filterProperty}:${sorter.filterValue}`;
        g.appendChild(label);
      } else {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', centerX.toString());
        label.setAttribute('y', (y + 46).toString());
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '9');
        label.setAttribute('font-family', 'sans-serif');
        label.setAttribute('fill', '#ffcc44');
        label.setAttribute('stroke', '#000');
        label.setAttribute('stroke-width', '2');
        label.setAttribute('paint-order', 'stroke');
        label.textContent = 'any';
        g.appendChild(label);
      }
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

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${cx},${cy}) scale(${item.renderScale})`);

    const props = def.properties;
    const size = (propertyRegistry.getValue('size', props.size as string) as number) || 24;
    const shape = (propertyRegistry.getValue('shape', props.shape as string) as string) || 'circle';
    const color = (propertyRegistry.getValue('color', props.color as string) as string) || '#888';

    let element: SVGElement;

    if (shape === 'circle') {
      element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      element.setAttribute('r', (size / 2).toString());
      element.setAttribute('fill', color);
    } else if (shape === 'triangle') {
      element = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const s = size;
      const points = `0,-${s/2} ${s/2},${s/2} -${s/2},${s/2}`;
      element.setAttribute('points', points);
      element.setAttribute('fill', color);
    } else {
      // Default to square
      element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      element.setAttribute('x', (-size / 2).toString());
      element.setAttribute('y', (-size / 2).toString());
      element.setAttribute('width', size.toString());
      element.setAttribute('height', size.toString());
      element.setAttribute('fill', color);
    }

    g.appendChild(element);
    itemsLayer.appendChild(g);
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

/**
 * Open (or re-open) the sorter configuration dialog for the given sorter
 * building. The dialog is a floating panel over the SVG that lets the player
 * pick a property and value to filter on.
 */
export function openSorterDialog(sorter: Sorter, onClose?: () => void): void {
  // Remove any existing dialog
  document.querySelector('#sorter-dialog')?.remove();

  const allProperties = propertyRegistry.getAllProperties();

  const dialog = document.createElement('div');
  dialog.id = 'sorter-dialog';

  // Build options HTML
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
      <label>
        Property
        <select id="sorter-prop-select">${propertyOptions}</select>
      </label>
      <label>
        Value
        <select id="sorter-val-select">${valueOptions}</select>
      </label>
      <button id="sorter-clear-btn">Clear filter (pass all)</button>
    </div>
  `;

  document.body.appendChild(dialog);

  // Position near the center of the viewport
  dialog.style.left = `${window.innerWidth / 2 - 120}px`;
  dialog.style.top  = `${window.innerHeight / 2 - 80}px`;

  const propSelect = dialog.querySelector<HTMLSelectElement>('#sorter-prop-select')!;
  const valSelect  = dialog.querySelector<HTMLSelectElement>('#sorter-val-select')!;

  const rebuildValueOptions = (propId: string, currentValue?: string) => {
    const propDef = allProperties.find(p => p.id === propId);
    if (!propDef) return;
    valSelect.innerHTML = Object.keys(propDef.values).map(v =>
      `<option value="${v}" ${v === currentValue ? 'selected' : ''}>${v}</option>`
    ).join('');
  };

  propSelect.addEventListener('change', () => {
    sorter.filterProperty = propSelect.value;
    rebuildValueOptions(propSelect.value);
    sorter.filterValue = valSelect.value;
  });

  valSelect.addEventListener('change', () => {
    sorter.filterValue = valSelect.value;
  });

  // Initialise state from current sorter settings
  if (sorter.filterProperty) {
    propSelect.value = sorter.filterProperty;
    rebuildValueOptions(sorter.filterProperty, sorter.filterValue);
  } else {
    // Default to first property + first value
    sorter.filterProperty = propSelect.value;
    sorter.filterValue = valSelect.value;
  }

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
 * Show or hide the request popup based on hover
 */
export function updateRequestPopup(world: WorldState, gridX: number, gridY: number, screenX: number, screenY: number): void {
  const popup = document.querySelector<HTMLDivElement>('#request-popup');
  if (!popup) return;

  const key = gridKey(gridX, gridY);
  const building = world.buildings.get(key);

  if (building?.type === 'receiver') {
    const receiver = building as Receiver;
    if (receiver.requestId) {
      const request = requestRegistry.getRequest(receiver.requestId);
      if (request) {
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
        
        content += `<div class="reward-info">Reward: $${request.cost} | Penalty: $${request.penalty}</div>`;
        
        popup.innerHTML = content;
        popup.style.display = 'block';
        popup.style.left = `${screenX + 20}px`;
        popup.style.top = `${screenY + 20}px`;
        return;
      }
    }
  }

  popup.style.display = 'none';
}
