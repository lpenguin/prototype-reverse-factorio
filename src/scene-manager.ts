import { SceneNode, GroupNode } from './scene.ts';

/**
 * Generic 2D scene manager. Knows nothing about game entities.
 * Manages named layers (z-ordered GroupNodes) and tracks nodes per layer by string key.
 * Provides a generic diffMap helper for reconciling a source Map against tracked nodes.
 */
export class SceneManager {
  readonly root: SVGGElement;
  private readonly _layers: Map<string, GroupNode> = new Map();
  private readonly _nodes: Map<string, Map<string, SceneNode>> = new Map();

  constructor(root: SVGGElement, layerNames: string[]) {
    this.root = root;
    for (const name of layerNames) {
      const layer = new GroupNode();
      this._layers.set(name, layer);
      this._nodes.set(name, new Map());
      root.appendChild(layer.el);
    }
  }

  /** Get the GroupNode for a named layer. */
  getLayer(name: string): GroupNode {
    const layer = this._layers.get(name);
    if (!layer) throw new Error(`Unknown layer: ${name}`);
    return layer;
  }

  /** Get all tracked nodes in a layer, keyed by string. */
  getAllNodes(layer: string): Map<string, SceneNode> {
    const nodes = this._nodes.get(layer);
    if (!nodes) throw new Error(`Unknown layer: ${layer}`);
    return nodes;
  }

  /** Get a single tracked node by layer + key. */
  getNode(layer: string, key: string): SceneNode | undefined {
    return this._nodes.get(layer)?.get(key);
  }

  /** Add a node to a layer, tracked by key. */
  addNode(layer: string, key: string, node: SceneNode): void {
    const layerGroup = this.getLayer(layer);
    const nodes = this.getAllNodes(layer);
    // Remove existing node at this key if any
    const existing = nodes.get(key);
    if (existing) {
      layerGroup.removeChild(existing);
    }
    nodes.set(key, node);
    layerGroup.addChild(node);
  }

  /** Remove a node from a layer by key. */
  removeNode(layer: string, key: string): void {
    const nodes = this._nodes.get(layer);
    if (!nodes) return;
    const node = nodes.get(key);
    if (node) {
      node.destroy();
      nodes.delete(key);
    }
  }

  /**
   * Generic diff: reconcile a source Map<string, T> against the tracked nodes in a layer.
   * - For each key in sourceMap that is NOT yet tracked → calls createFn, adds the result
   * - For each key in sourceMap that IS tracked → calls updateFn
   * - For each tracked key NOT in sourceMap → removes the node
   * Returns the set of removed keys (useful for dying-item management).
   */
  diffMap<T>(
    layer: string,
    sourceMap: Map<string, T>,
    createFn: (key: string, value: T) => SceneNode,
    updateFn: (key: string, value: T, node: SceneNode) => void,
  ): string[] {
    const nodes = this.getAllNodes(layer);
    const removed: string[] = [];

    // Add new + update existing
    for (const [key, value] of sourceMap) {
      const existing = nodes.get(key);
      if (existing) {
        updateFn(key, value, existing);
      } else {
        const node = createFn(key, value);
        this.addNode(layer, key, node);
      }
    }

    // Remove stale
    for (const key of nodes.keys()) {
      if (!sourceMap.has(key)) {
        removed.push(key);
      }
    }
    for (const key of removed) {
      this.removeNode(layer, key);
    }

    return removed;
  }

  /** Call syncDOM() on all tracked nodes across all layers. */
  syncAllDOM(): void {
    for (const nodes of this._nodes.values()) {
      for (const node of nodes.values()) {
        syncNodeTree(node);
      }
    }
  }
}

/** Recursively sync a node and all its children. */
function syncNodeTree(node: SceneNode): void {
  node.syncDOM();
  for (const child of node.children) {
    syncNodeTree(child);
  }
}
