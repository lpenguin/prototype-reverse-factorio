import type { BuildingDefinition } from './types.ts';
import config from './buildings.config.json';

class Registry {
  private buildings: Map<string, BuildingDefinition> = new Map();

  constructor() {
    for (const def of config.buildings) {
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

export const registry = new Registry();
export default registry;
