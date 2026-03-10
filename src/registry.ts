import type { BuildingDefinition, ItemDefinition, RequestDefinition } from './types.ts';
import buildingsConfig from './buildings.config.json';
import itemsConfig from './items.config.json';
import mapConfig from './map.config.json';
import requestsConfig from './requests.config.json';
import colorNamesConfig from './colors.config.json';

class MapRegistry {
  public readonly garbageRect: { x1: number; y1: number; x2: number; y2: number };
  public readonly density: number;
  public readonly minSize: number;
  public readonly maxSize: number;
  public readonly itemPool: string[];

  constructor() {
    const config = mapConfig as {
      garbageRect: { x1: number; y1: number; x2: number; y2: number };
      density: number;
      minSize?: number;
      maxSize?: number;
      itemPool?: string[];
    };
    this.garbageRect = config.garbageRect;
    this.density = config.density;
    this.minSize = config.minSize ?? 5;
    this.maxSize = config.maxSize ?? 15;
    this.itemPool = config.itemPool ?? [];
  }
}

class BuildingsRegistry {
  private buildings: Map<string, BuildingDefinition> = new Map();

  constructor() {
    for (const def of buildingsConfig.buildings) {
      this.buildings.set(def.id, def as BuildingDefinition);
    }
  }

  getBuilding(id: string): BuildingDefinition | undefined {
    return this.buildings.get(id);
  }

  getAllBuildings(): BuildingDefinition[] {
    return Array.from(this.buildings.values());
  }
}

class ItemRegistry {

  private items: Map<string, ItemDefinition> = new Map();

  constructor() {
    for (const def of itemsConfig.items) {
      this.items.set(def.id, def as ItemDefinition);
    }
  }

  getItem(id: string): ItemDefinition | undefined {
    return this.items.get(id);
  }

  getAllItems(): ItemDefinition[] {
    return Array.from(this.items.values());
  }
}

class ColorRegistry {
  private colors: Record<string, string>;

  constructor() {
    this.colors = colorNamesConfig;
  }

  getColorName(hex: string): string {
    return this.colors[hex.toLowerCase()] || hex;
  }
}

class RequestRegistry {
  private requests: RequestDefinition[] = [];
  private requestMap: Map<string, RequestDefinition> = new Map();
  private nextRequestIndex: number = 0;

  constructor() {
    const config = requestsConfig as unknown as { requests: RequestDefinition[] };
    for (const request of config.requests) {
      this.requests.push(request);
      this.requestMap.set(request.id, request);
    }
  }

  getNextRequest(): RequestDefinition | undefined {
    if (this.requests.length === 0) return undefined;
    const request = this.requests[this.nextRequestIndex];
    this.nextRequestIndex = (this.nextRequestIndex + 1) % this.requests.length;
    return request;
  }

  getRequest(id: string): RequestDefinition | undefined {
    return this.requestMap.get(id);
  }

  getAllRequests(): RequestDefinition[] {
    return this.requests;
  }
}

export const buildingsRegistry = new BuildingsRegistry();
export const itemRegistry = new ItemRegistry();
export const mapRegistry = new MapRegistry();
export const requestRegistry = new RequestRegistry();
export const colorRegistry = new ColorRegistry();
export default buildingsRegistry;
