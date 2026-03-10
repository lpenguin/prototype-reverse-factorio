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
  iconPath: string; // SVG path data
}

/**
 * Metadata about a request
 */
export interface RequestDefinition {
  id: string;
  name: string;
  properties: Record<string, string[] | { min: number; max: number }>;
  cost: number;
  penalty: number;
}

/**
 * Metadata about the map and generation settings
 */
export interface MapDefinition {
  garbageRect: { x1: number; y1: number; x2: number; y2: number };
  density: number;
  minSize?: number;
  maxSize?: number;
  itemPool?: string[];
}

/**
 * Configuration file structures
 */
export interface BuildingsConfig {
  buildings: BuildingDefinition[];
}

export interface ItemsConfig {
  items: ItemDefinition[];
}

export interface RequestsConfig {
  requests: RequestDefinition[];
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
  preferredStaticTypes?: string[];
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
}

export interface Belt extends BaseBuilding {
  type: 'belt';
  lastInputIndex?: number; // Index of the last source belt that successfully moved an item into this belt
}

export interface Receiver extends BaseBuilding {
  type: 'receiver';
  requestId?: string;
  lastInputIndex?: number;
}

export type Building = Emitter | Belt | Receiver;

/**
 * Static objects on the map (e.g. garbage piles)
 */
export interface StaticObject {
  type: 'garbage';
  x: number;
  y: number;
  itemPool: string[];
}

/**
 * Complete game state
 */
export interface WorldState {
  buildings: Map<string, Building>; // Key format: "x,y"
  items: Map<string, ItemInstance>;   // Key format: "x,y"
  staticObjects: Map<string, StaticObject>; // Key format: "x,y"
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
