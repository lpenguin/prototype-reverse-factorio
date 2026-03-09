import { createWorld } from './world.ts';
import type { ViewState } from './types.ts';
import { setupInput } from './input.ts';

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
  document.querySelector('#hud')!.textContent = `Money: $${world.playerMoney} | Tick: ${world.tick}`;
}, 500);

console.log('App initialized', world);

