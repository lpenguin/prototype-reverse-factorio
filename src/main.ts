import { createWorld } from './world.ts';
import type { ViewState, ItemInstance } from './types.ts';
import { setupInput } from './input.ts';
import { buildingsRegistry as registry } from './registry.ts';
import { updateHUD, renderWorld } from './renderer.ts';
import { tickWorld } from './simulation.ts';

function init() {
  const world = createWorld();
  const viewState: ViewState = {
    panX: window.innerWidth / 2,
    panY: window.innerHeight / 2,
    zoom: 1,
    cellSize: 48,
    selectedBuildingId: null,
    selectedDirection: 1, // Default to East
    previewCoords: null,
  };

  const svg = document.querySelector<SVGSVGElement>('#app')!;
  const worldGroup = document.querySelector<SVGGElement>('#world')!;
  const gridGroup = document.querySelector<SVGGElement>('#grid')!;

  const TICK_MS = 500;
  const LERP_SPEED = 10;
  const SCALE_SPEED = 12;

  // Items removed — kept alive for disappear animation
  const dyingItems = new Map<string, ItemInstance>();

  setupInput(svg, worldGroup, gridGroup, viewState, world, dyingItems);

  // Initialize toolbar
  const toolbar = document.querySelector<HTMLDivElement>('#toolbar')!;
  toolbar.innerHTML = '';
  registry.getAllBuildings().forEach(def => {
    const tool = document.createElement('div');
    tool.className = 'tool';
    tool.dataset.type = def.id;
    
    const icon = document.createElement('img');
    icon.src = def.iconPath;
    icon.style.width = '24px';
    icon.style.height = '24px';
    icon.style.pointerEvents = 'none';
    
    const label = document.createElement('span');
    label.textContent = def.name;
    label.style.marginLeft = '8px';
    label.style.pointerEvents = 'none';
    
    tool.style.display = 'flex';
    tool.style.alignItems = 'center';
    
    tool.appendChild(icon);
    tool.appendChild(label);
    
    tool.addEventListener('click', () => {
      const isSelected = tool.classList.contains('selected');
      document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
      
      if (isSelected) {
        viewState.selectedBuildingId = null;
      } else {
        tool.classList.add('selected');
        viewState.selectedBuildingId = def.id;
      }
      console.log('Selected tool:', viewState.selectedBuildingId);
    });
    toolbar.appendChild(tool);
  });

  const pauseBtn = document.querySelector<HTMLDivElement>('#pause-btn')!;
  pauseBtn.addEventListener('click', () => {
    world.isPaused = !world.isPaused;
    pauseBtn.textContent = world.isPaused ? 'Resume' : 'Pause';
    pauseBtn.classList.toggle('selected', world.isPaused);
  });

  // Simulation tick — snapshot before tick to catch removed items
  setInterval(() => {
    if (world.isPaused) return;
    const snapshot = new Map(world.items);
    tickWorld(world);
    updateHUD(world);
    const livingItems = new Set(world.items.values());
    for (const [key, item] of snapshot) {
      if (!livingItems.has(item) && !dyingItems.has(key)) {
        dyingItems.set(key, item);
      }
    }
  }, TICK_MS);

  // Render loop — lerp item render properties each frame
  let lastTime = performance.now();
  function renderLoop() {
    const now = performance.now();
    const tDelta = (now - lastTime) / 1000;
    lastTime = now;

    world.items.forEach(item => {
      item.renderX += (item.x - item.renderX) * tDelta * LERP_SPEED;
      item.renderY += (item.y - item.renderY) * tDelta * LERP_SPEED;
      item.renderScale += (1 - item.renderScale) * tDelta * SCALE_SPEED;
    });

    for (const [key, item] of dyingItems) {
      const dx = item.x - item.renderX;
      const dy = item.y - item.renderY;
      item.renderX += dx * tDelta * LERP_SPEED;
      item.renderY += dy * tDelta * LERP_SPEED;
      // Only start scaling out once arrived at target
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
        item.renderScale += (0 - item.renderScale) * tDelta * SCALE_SPEED;
        if (item.renderScale < 0.01) dyingItems.delete(key);
      }
    }

    renderWorld(world, worldGroup, viewState, dyingItems);
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  console.log('App initialized', world);
}

init();

