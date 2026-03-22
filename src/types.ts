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
 * Per-tick move resolution state used by the 3-phase simulation algorithm.
 * Not stored on ItemInstance — tracked in a side-table inside tickWorld().
 */
export const MoveState = {
  UNRESOLVED: 'UNRESOLVED',
  EVALUATING: 'EVALUATING',
  LOCKED_MOVING: 'LOCKED_MOVING',
  BLOCKED: 'BLOCKED',
} as const;

export type MoveState = (typeof MoveState)[keyof typeof MoveState];

/**
 * Grid settings
 */
export const CELL_SIZE = 48;


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
 * Metadata about a property type
 */
export interface PropertyDefinition {
  id: string;
  name: string;
  values: Record<string, string | number>;
}

/**
 * Metadata about a request
 */
export interface RequestDefinition {
  id: string;
  name: string;
  properties: Record<string, string[]>;
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
export interface PropertiesConfig {
  properties: PropertyDefinition[];
}

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
  /** Stable identity assigned by addItem(). Always set once the item is in the world. */
  id: string;
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
export type BuildingType = 'emitter' | 'belt' | 'receiver' | 'scanner' | 'arm' | 'button' | 'lamp' | 'splitter' | 'merger';

export interface BuildingDefinition {
  id: string;
  name: string;
  type: BuildingType;
  size: { x: number; y: number };
  iconPath: string; // URL to the external SVG
  preferredStaticTypes?: string[];
  wireConnectable?: boolean;
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
  /** The specific request this receiver is currently trying to satisfy */
  request: RequestDefinition;
  lastInputIndex?: number;
}

export interface Scanner extends BaseBuilding {
  type: 'scanner';
  filterProperty?: string;
  filterValue?: string;
}

export interface Arm extends BaseBuilding {
  type: 'arm';
}

export interface Button extends BaseBuilding {
  type: 'button';
  isOn: boolean;
}

export interface Lamp extends BaseBuilding {
  type: 'lamp';
}

export interface Splitter extends BaseBuilding {
  type: 'splitter';
  /** 0 = left was last used, 1 = right was last used (undefined = neither yet used). */
  lastOutputSide?: 0 | 1;
}

export interface Merger extends BaseBuilding {
  type: 'merger';
  /** 0 = input1 (anchor) was last used, 1 = input2 (secondary) was last used (undefined = neither yet). */
  lastInputSide?: 0 | 1;
}

export type Building = Emitter | Belt | Receiver | Scanner | Arm | Button | Lamp | Splitter | Merger;

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
  wireCells: Set<string>; // Key format: "x,y"
  signals: Map<string, boolean>; // Key format: building key
  staticObjects: Map<string, StaticObject>; // Key format: "x,y"
  /**
   * Maps secondary-cell key → anchor-cell key for multi-cell buildings.
   * Blocks the secondary cell from hosting items or other buildings.
   */
  buildingSecondary: Map<string, string>;
  /** Global repository of available requests */
  requests: RequestDefinition[];
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
  selectedBuildingId: string | null;
  selectedDirection: Direction;
  previewCoords: { x: number; y: number } | null;
  wirePreviewCells: string[];
}
