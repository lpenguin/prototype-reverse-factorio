import { createWorld } from './world.ts';
import type { ViewState, ItemInstance } from './types.ts';
import * as TWEEN from '@tweenjs/tween.js';
import { setupInput } from './input.ts';
import { buildingsRegistry as registry } from './registry.ts';
import { updateHUD } from './renderer.ts';
import { tickWorld } from './simulation.ts';
import { GameTimer } from './timer.ts';
import { WorldRenderer } from './world-renderer.ts';

function init() {
  const world = createWorld();
  const viewState: ViewState = {
    panX: window.innerWidth / 2,
    panY: window.innerHeight / 2,
    zoom: 1,
    selectedBuildingId: null,
    selectedDirection: 1, // Default to East
    previewCoords: null,
    wirePreviewCells: [],
    wireErasePreviewCells: [],
  };

  const svg = document.querySelector<SVGSVGElement>('#app')!;
  const worldGroup = document.querySelector<SVGGElement>('#world')!;
  const gridGroup = document.querySelector<SVGGElement>('#grid')!;

  const TICK_MS = 500;
  const LERP_SPEED = 10;
  const SCALE_SPEED = 12;

  // Items removed — kept alive for disappear animation
  const dyingItems = new Map<string, ItemInstance>();

  const worldRenderer = new WorldRenderer(worldGroup, gridGroup);

  setupInput(svg, worldGroup, gridGroup, viewState, world, dyingItems, worldRenderer);

  // Initialize toolbar
  const toolbar = document.querySelector<HTMLDivElement>('#toolbar')!;
  toolbar.innerHTML = '';

  function createToolItem(id: string, iconSrc: string, name: string): HTMLDivElement {
    const tool = document.createElement('div');
    tool.className = 'tool';
    tool.dataset.type = id;

    const label = document.createElement('span');
    label.className = 'tool-name';
    label.textContent = name;
    label.style.pointerEvents = 'none';

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'tool-icon';
    iconWrapper.style.pointerEvents = 'none';

    const icon = document.createElement('img');
    icon.src = iconSrc;
    icon.style.width = '38px';
    icon.style.height = '38px';
    icon.style.pointerEvents = 'none';

    iconWrapper.appendChild(icon);
    tool.appendChild(label);
    tool.appendChild(iconWrapper);

    return tool;
  }

  registry.getAllBuildings().forEach(def => {
    const tool = createToolItem(def.id, def.iconPath, def.name);
    tool.addEventListener('click', () => {
      const isSelected = tool.classList.contains('selected');
      document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
      if (isSelected) {
        viewState.selectedBuildingId = null;
      } else {
        tool.classList.add('selected');
        viewState.selectedBuildingId = def.id;
      }
    });
    toolbar.appendChild(tool);
  });

  // Add separator
  const sep = document.createElement('div');
  sep.className = 'separator';
  toolbar.appendChild(sep);

  // Add erase tool
  const eraseTool = createToolItem('erase', '/icons/erase.svg', 'Erase');
  eraseTool.addEventListener('click', () => {
    const isSelected = eraseTool.classList.contains('selected');
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
    if (isSelected) {
      viewState.selectedBuildingId = null;
    } else {
      eraseTool.classList.add('selected');
      viewState.selectedBuildingId = 'erase';
    }
  });
  toolbar.appendChild(eraseTool);

  // Add wire mode tool
  const wireTool = createToolItem('wire', '/icons/wire.svg', 'Wire');
  wireTool.addEventListener('click', () => {
    const isSelected = wireTool.classList.contains('selected');
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
    if (isSelected) {
      viewState.selectedBuildingId = null;
    } else {
      wireTool.classList.add('selected');
      viewState.selectedBuildingId = 'wire';
    }
  });
  toolbar.appendChild(wireTool);

  const pauseBtn = document.querySelector<HTMLDivElement>('#pause-btn')!;
  const pauseBtnLabel = document.querySelector<HTMLSpanElement>('#pause-btn-label')!;
  const pauseBtnIcon = document.querySelector<HTMLImageElement>('#pause-btn-icon')!;
  pauseBtn.addEventListener('click', () => {
    world.isPaused = !world.isPaused;
    pauseBtnLabel.textContent = world.isPaused ? 'Resume' : 'Pause';
    pauseBtnIcon.src = world.isPaused ? '/icons/play-button.svg' : '/icons/pause-button.svg';
    pauseBtn.classList.toggle('selected', world.isPaused);
  });

  // Simulation tick — snapshot before tick to catch removed items
  // Render loop — lerp item render properties each frame
  const timer = new GameTimer(TICK_MS);

  timer.onTick(() => {
    if (world.isPaused) return;
    const snapshot = new Map(world.items);
    tickWorld(world);
    updateHUD(world);

    const livingItems = new Set(world.items.values());
    for (const [, item] of snapshot) {
      if (!livingItems.has(item) && !dyingItems.has(item.id)) {
        dyingItems.set(item.id, item);
      }
    }
  });

  timer.onFrame(tDelta => {
    TWEEN.update(performance.now());

    world.items.forEach(item => {
      item.renderX += (item.x - item.renderX) * tDelta * LERP_SPEED;
      item.renderY += (item.y - item.renderY) * tDelta * LERP_SPEED;
      item.renderScale += (1 - item.renderScale) * tDelta * SCALE_SPEED;
    });

    for (const [id, item] of dyingItems) {
      const dx = item.x - item.renderX;
      const dy = item.y - item.renderY;
      item.renderX += dx * tDelta * LERP_SPEED;
      item.renderY += dy * tDelta * LERP_SPEED;
      // Only start scaling out once arrived at target
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
        item.renderScale += (0 - item.renderScale) * tDelta * SCALE_SPEED;
        if (item.renderScale < 0.01) dyingItems.delete(id);
      }
    }

    worldRenderer.syncAll(world, viewState, dyingItems);
  });

  timer.start();

  console.log('App initialized', world);
}

init();

