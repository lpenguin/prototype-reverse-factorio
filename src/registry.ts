import type { 
  BuildingDefinition, 
  ItemDefinition, 
  RequestDefinition,
  MapDefinition,
  BuildingsConfig,
  ItemsConfig,
  RequestsConfig,
  PropertiesConfig,
  PropertyDefinition
} from './types.ts';
import buildingsConfigJson from './buildings.config.json';
import itemsConfigJson from './items.config.json';
import mapConfigJson from './map.config.json';
import requestsConfigJson from './requests.config.json';
import propertiesConfigJson from './properties.config.json';

const buildingsConfig = buildingsConfigJson as BuildingsConfig;
const itemsConfig = itemsConfigJson as ItemsConfig;
const mapConfig = mapConfigJson as MapDefinition;
const requestsConfig = requestsConfigJson as unknown as RequestsConfig;
const propertiesConfig = propertiesConfigJson as unknown as PropertiesConfig;

class MapRegistry {
  public readonly garbageRect: { x1: number; y1: number; x2: number; y2: number };
  public readonly density: number;
  public readonly minSize: number;
  public readonly maxSize: number;
  public readonly itemPool: string[];

  constructor() {
    this.garbageRect = mapConfig.garbageRect;
    this.density = mapConfig.density;
    this.minSize = mapConfig.minSize ?? 5;
    this.maxSize = mapConfig.maxSize ?? 15;
    this.itemPool = mapConfig.itemPool ?? [];
  }
}

class BuildingsRegistry {
  private buildings: Map<string, BuildingDefinition> = new Map();

  constructor() {
    for (const def of buildingsConfig.buildings) {
      this.buildings.set(def.id, def);
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
      this.items.set(def.id, def);
    }
  }

  getItem(id: string): ItemDefinition | undefined {
    return this.items.get(id);
  }

  getAllItems(): ItemDefinition[] {
    return Array.from(this.items.values());
  }
}

class PropertyRegistry {
  private properties: Map<string, PropertyDefinition> = new Map();

  constructor() {
    for (const def of propertiesConfig.properties) {
      this.properties.set(def.id, def);
    }
  }

  getProperty(id: string): PropertyDefinition | undefined {
    return this.properties.get(id);
  }

  getValue(propertyId: string, valueName: string): string | number | undefined {
    return this.properties.get(propertyId)?.values[valueName];
  }
}

class RequestRegistry {
  private requests: RequestDefinition[] = [];
  private requestMap: Map<string, RequestDefinition> = new Map();
  private nextRequestIndex: number = 0;

  constructor() {
    for (const request of requestsConfig.requests) {
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
export const propertyRegistry = new PropertyRegistry();
export default buildingsRegistry;
