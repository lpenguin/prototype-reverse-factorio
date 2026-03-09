import { createWorld } from './world.ts';
import type { ViewState } from './types.ts';
import { setupInput } from './input.ts';
import { registry } from './registry.ts';

function init() {
  const world = createWorld();
  const viewState: ViewState = {
    panX: window.innerWidth / 2,
    panY: window.innerHeight / 2,
    zoom: 1,
    cellSize: 48,
  };

  const svg = document.querySelector<SVGSVGElement>('#app')!;
  const worldGroup = document.querySelector<SVGGElement>('#world')!;
  const gridGroup = document.querySelector<SVGGElement>('#grid')!;

  setupInput(svg, worldGroup, gridGroup, viewState);

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
      document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
      tool.classList.add('selected');
      console.log('Selected tool:', def.id);
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
    const hud = document.querySelector('#hud');
    if (hud) hud.textContent = `Money: $${world.playerMoney} | Tick: ${world.tick}`;
  }, 500);

  console.log('App initialized', world);
}

init();

