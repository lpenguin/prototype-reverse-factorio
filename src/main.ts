import { createWorld } from './world.ts';
import type { ViewState } from './types.ts';
import { setupInput } from './input.ts';
import { registry } from './registry.ts';
import { updateHUD, renderWorld } from './renderer.ts';

function init() {
  const world = createWorld();
  const viewState: ViewState = {
    panX: window.innerWidth / 2,
    panY: window.innerHeight / 2,
    zoom: 1,
    cellSize: 48,
    selectedBuildingId: null,
    previewCoords: null,
  };

  const svg = document.querySelector<SVGSVGElement>('#app')!;
  const worldGroup = document.querySelector<SVGGElement>('#world')!;
  const gridGroup = document.querySelector<SVGGElement>('#grid')!;

  setupInput(svg, worldGroup, gridGroup, viewState, world);

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

  // Tick loop placeholder
  setInterval(() => {
    if (world.isPaused) return;
    world.tick++;
    updateHUD(world);
    renderWorld(world, worldGroup, viewState);
  }, 500);

  console.log('App initialized', world);
}

init();

