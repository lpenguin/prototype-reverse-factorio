import type { BuildingDefinition, ItemDefinition } from './types.ts';
import buildingsConfig from './buildings.config.json';
import itemsConfig from './items.config.json';
import mapConfig from './map.config.json';

class MapRegistry {
  public readonly garbageRect: { x1: number; y1: number; x2: number; y2: number };
  public readonly density: number;
  public readonly minSize: number;
  public readonly maxSize: number;
  public readonly itemPool: string[];

  constructor() {
    const config = mapConfig as any;
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

export const buildingsRegistry = new BuildingsRegistry();
export const itemRegistry = new ItemRegistry();
export const mapRegistry = new MapRegistry();
export default buildingsRegistry;
