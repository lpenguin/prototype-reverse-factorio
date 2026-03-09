/**
 * 4-way directional system
 */
export const Direction = {
  N: 0,
  E: 1,
  S: 2,
  W: 3,
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];


/**
 * Metadata about an item type
 */
export interface ItemDefinition {
  id: string;
  name: string;
  properties: Record<string, string | number>;
  cost: number;
  iconPath: string; // SVG path data
}

/**
 * An item instance on the grid
 */
export interface ItemInstance {
  defId: string;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  renderScale: number;
}

/**
 * Base building interface
 */
export type BuildingType = 'emitter' | 'belt' | 'receiver';

export interface BuildingDefinition {
  id: string;
  name: string;
  type: BuildingType;
  size: { x: number; y: number };
  iconPath: string; // URL to the external SVG
  itemPool?: string[];
  ports?: Array<{
    type: 'input' | 'output';
    x: number;
    y: number;
    direction: string;
  }>;
}

export interface BaseBuilding {
  type: BuildingType;
  x: number;
  y: number;
  direction: Direction;
}

export interface Emitter extends BaseBuilding {
  type: 'emitter';
  itemPool: string[]; // List of ItemDefinition IDs
}

export interface Belt extends BaseBuilding {
  type: 'belt';
}

export interface Receiver extends BaseBuilding {
  type: 'receiver';
}

export type Building = Emitter | Belt | Receiver;

/**
 * Complete game state
 */
export interface WorldState {
  buildings: Map<string, Building>; // Key format: "x,y"
  items: Map<string, ItemInstance>;   // Key format: "x,y"
  playerMoney: number;
  tick: number;
  isPaused: boolean;
}

/**
 * Viewport / View state for rendering
 */
export interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
  cellSize: number;
  selectedBuildingId: string | null;
  selectedDirection: Direction;
  previewCoords: { x: number; y: number } | null;
}
