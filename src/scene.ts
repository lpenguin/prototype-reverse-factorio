const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
let INLINE_SVG_COUNTER = 0;

/**
 * Base class for all scene graph nodes.
 * Owns a <g> SVGGElement. Manages position, rotation, scale, visibility, opacity.
 * Only writes to the DOM when properties actually change.
 */
export class SceneNode {
  readonly el: SVGGElement;
  private _x = 0;
  private _y = 0;
  private _rotation = 0;
  private _pivotX = 0;
  private _pivotY = 0;
  private _scaleX = 1;
  private _scaleY = 1;
  private _visible = true;
  private _opacity = 1;
  private _transformDirty = true;
  private _visibilityDirty = true;
  private _opacityDirty = true;

  parent: SceneNode | null = null;
  readonly children: SceneNode[] = [];

  constructor() {
    this.el = document.createElementNS(SVG_NS, 'g');
  }

  get x() { return this._x; }
  set x(v: number) { if (v !== this._x) { this._x = v; this._transformDirty = true; } }

  get y() { return this._y; }
  set y(v: number) { if (v !== this._y) { this._y = v; this._transformDirty = true; } }

  get rotation() { return this._rotation; }
  set rotation(v: number) { if (v !== this._rotation) { this._rotation = v; this._transformDirty = true; } }

  get pivotX() { return this._pivotX; }
  set pivotX(v: number) { if (v !== this._pivotX) { this._pivotX = v; this._transformDirty = true; } }

  get pivotY() { return this._pivotY; }
  set pivotY(v: number) { if (v !== this._pivotY) { this._pivotY = v; this._transformDirty = true; } }

  get scaleX() { return this._scaleX; }
  set scaleX(v: number) { if (v !== this._scaleX) { this._scaleX = v; this._transformDirty = true; } }

  get scaleY() { return this._scaleY; }
  set scaleY(v: number) { if (v !== this._scaleY) { this._scaleY = v; this._transformDirty = true; } }

  get visible() { return this._visible; }
  set visible(v: boolean) { if (v !== this._visible) { this._visible = v; this._visibilityDirty = true; } }

  get opacity() { return this._opacity; }
  set opacity(v: number) { if (v !== this._opacity) { this._opacity = v; this._opacityDirty = true; } }

  /** Mark the transform as needing a DOM write on next sync. */
  invalidateTransform(): void {
    this._transformDirty = true;
  }

  /** Apply any dirty properties to the DOM. Call once per frame. */
  syncDOM(): void {
    if (this._transformDirty) {
      this._transformDirty = false;
      let t = '';
      if (this._x !== 0 || this._y !== 0) {
        t += `translate(${this._x},${this._y})`;
      }
      if (this._rotation !== 0) {
        t += ` rotate(${this._rotation},${this._pivotX},${this._pivotY})`;
      }
      if (this._scaleX !== 1 || this._scaleY !== 1) {
        t += ` scale(${this._scaleX},${this._scaleY})`;
      }
      this.el.setAttribute('transform', t.trim() || '');
    }
    if (this._visibilityDirty) {
      this._visibilityDirty = false;
      this.el.style.display = this._visible ? '' : 'none';
    }
    if (this._opacityDirty) {
      this._opacityDirty = false;
      this.el.style.opacity = this._opacity === 1 ? '' : this._opacity.toString();
    }
  }

  addChild(child: SceneNode): void {
    if (child.parent) child.parent.removeChild(child);
    child.parent = this;
    this.children.push(child);
    this.el.appendChild(child.el);
  }

  removeChild(child: SceneNode): void {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parent = null;
      child.el.remove();
    }
  }

  destroy(): void {
    if (this.parent) {
      this.parent.removeChild(this);
    } else {
      this.el.remove();
    }
    // Recursive cleanup
    for (let i = this.children.length - 1; i >= 0; i--) {
      this.children[i].destroy();
    }
  }
}

/**
 * Pure grouping container. Same as SceneNode but explicit intent.
 */
export class GroupNode extends SceneNode {}

/**
 * Displays an SVG <image> element (for icons, sprites).
 * Updates href/position/size only when changed.
 */
export class SpriteNode extends SceneNode {
  private readonly _image: SVGImageElement;
  private _href = '';
  private _width = 0;
  private _height = 0;
  private _imgX = 0;
  private _imgY = 0;
  private _imgOpacity = 1;
  private _imgRotation = 0;
  private _imgPivotX = 0;
  private _imgPivotY = 0;
  private _imgDirty = true;

  constructor() {
    super();
    this._image = document.createElementNS(SVG_NS, 'image');
    this.el.appendChild(this._image);
  }

  get href() { return this._href; }
  set href(v: string) { if (v !== this._href) { this._href = v; this._imgDirty = true; } }

  get width() { return this._width; }
  set width(v: number) { if (v !== this._width) { this._width = v; this._imgDirty = true; } }

  get height() { return this._height; }
  set height(v: number) { if (v !== this._height) { this._height = v; this._imgDirty = true; } }

  get imgX() { return this._imgX; }
  set imgX(v: number) { if (v !== this._imgX) { this._imgX = v; this._imgDirty = true; } }

  get imgY() { return this._imgY; }
  set imgY(v: number) { if (v !== this._imgY) { this._imgY = v; this._imgDirty = true; } }

  get imgOpacity() { return this._imgOpacity; }
  set imgOpacity(v: number) { if (v !== this._imgOpacity) { this._imgOpacity = v; this._imgDirty = true; } }

  get imgRotation() { return this._imgRotation; }
  set imgRotation(v: number) { if (v !== this._imgRotation) { this._imgRotation = v; this._imgDirty = true; } }

  get imgPivotX() { return this._imgPivotX; }
  set imgPivotX(v: number) { if (v !== this._imgPivotX) { this._imgPivotX = v; this._imgDirty = true; } }

  get imgPivotY() { return this._imgPivotY; }
  set imgPivotY(v: number) { if (v !== this._imgPivotY) { this._imgPivotY = v; this._imgDirty = true; } }

  override syncDOM(): void {
    super.syncDOM();
    if (this._imgDirty) {
      this._imgDirty = false;
      this._image.setAttributeNS(XLINK_NS, 'href', this._href);
      this._image.setAttribute('x', this._imgX.toString());
      this._image.setAttribute('y', this._imgY.toString());
      this._image.setAttribute('width', this._width.toString());
      this._image.setAttribute('height', this._height.toString());
      if (this._imgOpacity !== 1) {
        this._image.setAttribute('opacity', this._imgOpacity.toString());
      } else {
        this._image.removeAttribute('opacity');
      }
      if (this._imgRotation !== 0) {
        this._image.setAttribute('transform', `rotate(${this._imgRotation},${this._imgPivotX},${this._imgPivotY})`);
      } else {
        this._image.removeAttribute('transform');
      }
    }
  }
}

/**
 * Renders an inline SVG document as part of the scene graph.
 * IDs are namespaced to avoid collisions so internal parts can be controlled safely.
 */
export class InlineSvgNode extends SceneNode {
  private _svgSource = '';
  private _svgX = 0;
  private _svgY = 0;
  private _width = 0;
  private _height = 0;
  private _svgOpacity = 1;
  private _svgDirty = true;
  private _layoutDirty = true;
  private _svgRoot: SVGSVGElement | null = null;
  private readonly _idPrefix: string;
  private readonly _idMap = new Map<string, string>();

  constructor() {
    super();
    INLINE_SVG_COUNTER += 1;
    this._idPrefix = `inline-svg-${INLINE_SVG_COUNTER}`;
  }

  get svgSource() { return this._svgSource; }
  set svgSource(v: string) {
    if (v !== this._svgSource) {
      this._svgSource = v;
      this._svgDirty = true;
    }
  }

  get svgX() { return this._svgX; }
  set svgX(v: number) { if (v !== this._svgX) { this._svgX = v; this._layoutDirty = true; } }

  get svgY() { return this._svgY; }
  set svgY(v: number) { if (v !== this._svgY) { this._svgY = v; this._layoutDirty = true; } }

  get width() { return this._width; }
  set width(v: number) { if (v !== this._width) { this._width = v; this._layoutDirty = true; } }

  get height() { return this._height; }
  set height(v: number) { if (v !== this._height) { this._height = v; this._layoutDirty = true; } }

  get svgOpacity() { return this._svgOpacity; }
  set svgOpacity(v: number) { if (v !== this._svgOpacity) { this._svgOpacity = v; this._layoutDirty = true; } }

  getElementByOriginalId(id: string): SVGGraphicsElement | null {
    if (this._svgDirty) {
      this._rebuildSvg();
    }
    if (!this._svgRoot) return null;
    const mappedId = this._idMap.get(id);
    if (!mappedId) return null;
    const escaped = this._escapeCssId(mappedId);
    return this._svgRoot.querySelector(`#${escaped}`) as SVGGraphicsElement | null;
  }

  private _escapeCssId(id: string): string {
    return id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  private _rewriteSvgReferences(svgRoot: SVGSVGElement): void {
    this._idMap.clear();

    const withId = Array.from(svgRoot.querySelectorAll('[id]')) as SVGElement[];
    for (const el of withId) {
      const originalId = el.id;
      if (!originalId) continue;
      const mappedId = `${this._idPrefix}-${originalId}`;
      this._idMap.set(originalId, mappedId);
      el.id = mappedId;
    }

    const rewriteValue = (value: string): string => {
      let next = value.replace(/url\(#([^)]+)\)/g, (_m, id: string) => {
        const mapped = this._idMap.get(id);
        return mapped ? `url(#${mapped})` : `url(#${id})`;
      });

      if (next.startsWith('#')) {
        const rawId = next.slice(1);
        const mapped = this._idMap.get(rawId);
        if (mapped) {
          next = `#${mapped}`;
        }
      }

      return next;
    };

    const all = Array.from(svgRoot.querySelectorAll('*')) as SVGElement[];
    for (const el of all) {
      for (const attr of Array.from(el.attributes)) {
        const rewritten = rewriteValue(attr.value);
        if (rewritten !== attr.value) {
          el.setAttribute(attr.name, rewritten);
        }
      }
    }
  }

  private _rebuildSvg(): void {
    this._svgDirty = false;
    this._svgRoot?.remove();
    this._svgRoot = null;

    if (!this._svgSource.trim()) {
      this._idMap.clear();
      return;
    }

    const parser = new DOMParser();
    const parsed = parser.parseFromString(this._svgSource, 'image/svg+xml');
    const maybeSvg = parsed.documentElement;
    if (!(maybeSvg instanceof SVGSVGElement)) {
      this._idMap.clear();
      return;
    }

    const svgRoot = document.importNode(maybeSvg, true) as SVGSVGElement;
    this._rewriteSvgReferences(svgRoot);
    this._svgRoot = svgRoot;
    this.el.appendChild(svgRoot);
    this._layoutDirty = true;
  }

  override syncDOM(): void {
    super.syncDOM();

    if (this._svgDirty) {
      this._rebuildSvg();
    }

    if (this._layoutDirty && this._svgRoot) {
      this._layoutDirty = false;
      this._svgRoot.setAttribute('x', this._svgX.toString());
      this._svgRoot.setAttribute('y', this._svgY.toString());
      this._svgRoot.setAttribute('width', this._width.toString());
      this._svgRoot.setAttribute('height', this._height.toString());
      if (this._svgOpacity !== 1) {
        this._svgRoot.setAttribute('opacity', this._svgOpacity.toString());
      } else {
        this._svgRoot.removeAttribute('opacity');
      }
    }
  }
}

export type ShapeType = 'rect' | 'circle' | 'polygon';

/**
 * Renders an SVG primitive: rect, circle, or polygon.
 * Swaps the underlying SVG element only when the shape type changes.
 */
export class ShapeNode extends SceneNode {
  private _shapeEl: SVGElement;
  private _shape: ShapeType = 'rect';
  private _fill = '#888';
  private _stroke = '';
  private _strokeWidth = 0;
  private _fillOpacity = 1;
  private _size = 24;
  private _points = '';
  // Extra rect attributes for non-centered rects
  private _rectX = 0;
  private _rectY = 0;
  private _rectW = 0;
  private _rectH = 0;
  private _useRect = false;
  private _shapeDirty = true;
  private _attrsDirty = true;

  constructor(shape: ShapeType = 'rect') {
    super();
    this._shape = shape;
    this._shapeEl = this._createElement();
    this.el.appendChild(this._shapeEl);
  }

  get shape() { return this._shape; }
  set shape(v: ShapeType) {
    if (v !== this._shape) {
      this._shape = v;
      this._shapeDirty = true;
    }
  }

  get fill() { return this._fill; }
  set fill(v: string) { if (v !== this._fill) { this._fill = v; this._attrsDirty = true; } }

  get stroke() { return this._stroke; }
  set stroke(v: string) { if (v !== this._stroke) { this._stroke = v; this._attrsDirty = true; } }

  get strokeWidth() { return this._strokeWidth; }
  set strokeWidth(v: number) { if (v !== this._strokeWidth) { this._strokeWidth = v; this._attrsDirty = true; } }

  get fillOpacity() { return this._fillOpacity; }
  set fillOpacity(v: number) { if (v !== this._fillOpacity) { this._fillOpacity = v; this._attrsDirty = true; } }

  get size() { return this._size; }
  set size(v: number) { if (v !== this._size) { this._size = v; this._attrsDirty = true; } }

  get points() { return this._points; }
  set points(v: string) { if (v !== this._points) { this._points = v; this._attrsDirty = true; } }

  /** Set explicit rect dimensions (for non-centered rects like ghost preview) */
  setRect(x: number, y: number, w: number, h: number): void {
    this._useRect = true;
    if (x !== this._rectX || y !== this._rectY || w !== this._rectW || h !== this._rectH) {
      this._rectX = x; this._rectY = y; this._rectW = w; this._rectH = h;
      this._attrsDirty = true;
    }
  }

  private _createElement(): SVGElement {
    const tag = this._shape === 'circle' ? 'circle'
      : this._shape === 'polygon' ? 'polygon'
      : 'rect';
    return document.createElementNS(SVG_NS, tag);
  }

  override syncDOM(): void {
    super.syncDOM();
    if (this._shapeDirty) {
      this._shapeDirty = false;
      const newEl = this._createElement();
      this._shapeEl.replaceWith(newEl);
      this._shapeEl = newEl;
      this._attrsDirty = true; // must re-apply all attrs
    }
    if (this._attrsDirty) {
      this._attrsDirty = false;
      const el = this._shapeEl;
      el.setAttribute('fill', this._fill);
      if (this._stroke) {
        el.setAttribute('stroke', this._stroke);
        el.setAttribute('stroke-width', this._strokeWidth.toString());
      }
      if (this._fillOpacity !== 1) {
        el.setAttribute('fill-opacity', this._fillOpacity.toString());
      }

      if (this._shape === 'circle') {
        el.setAttribute('r', (this._size / 2).toString());
      } else if (this._shape === 'polygon') {
        el.setAttribute('points', this._points);
      } else {
        // rect
        if (this._useRect) {
          el.setAttribute('x', this._rectX.toString());
          el.setAttribute('y', this._rectY.toString());
          el.setAttribute('width', this._rectW.toString());
          el.setAttribute('height', this._rectH.toString());
        } else {
          el.setAttribute('x', (-this._size / 2).toString());
          el.setAttribute('y', (-this._size / 2).toString());
          el.setAttribute('width', this._size.toString());
          el.setAttribute('height', this._size.toString());
        }
      }
    }
  }
}

/**
 * Renders an SVG <text> element.
 * Only updates the DOM when text content or style properties change.
 */
export class TextNode extends SceneNode {
  private readonly _textEl: SVGTextElement;
  private _text = '';
  private _fontSize = '12';
  private _fontFamily = 'sans-serif';
  private _fill = '#fff';
  private _textAnchor = 'middle';
  private _stroke = '';
  private _strokeWidth = 0;
  private _paintOrder = '';
  private _textX = 0;
  private _textY = 0;
  private _textDirty = true;

  constructor() {
    super();
    this._textEl = document.createElementNS(SVG_NS, 'text');
    this.el.appendChild(this._textEl);
  }

  get text() { return this._text; }
  set text(v: string) { if (v !== this._text) { this._text = v; this._textDirty = true; } }

  get fontSize() { return this._fontSize; }
  set fontSize(v: string) { if (v !== this._fontSize) { this._fontSize = v; this._textDirty = true; } }

  get fontFamily() { return this._fontFamily; }
  set fontFamily(v: string) { if (v !== this._fontFamily) { this._fontFamily = v; this._textDirty = true; } }

  get fill() { return this._fill; }
  set fill(v: string) { if (v !== this._fill) { this._fill = v; this._textDirty = true; } }

  get textAnchor() { return this._textAnchor; }
  set textAnchor(v: string) { if (v !== this._textAnchor) { this._textAnchor = v; this._textDirty = true; } }

  get stroke() { return this._stroke; }
  set stroke(v: string) { if (v !== this._stroke) { this._stroke = v; this._textDirty = true; } }

  get strokeWidth() { return this._strokeWidth; }
  set strokeWidth(v: number) { if (v !== this._strokeWidth) { this._strokeWidth = v; this._textDirty = true; } }

  get paintOrder() { return this._paintOrder; }
  set paintOrder(v: string) { if (v !== this._paintOrder) { this._paintOrder = v; this._textDirty = true; } }

  get textX() { return this._textX; }
  set textX(v: number) { if (v !== this._textX) { this._textX = v; this._textDirty = true; } }

  get textY() { return this._textY; }
  set textY(v: number) { if (v !== this._textY) { this._textY = v; this._textDirty = true; } }

  override syncDOM(): void {
    super.syncDOM();
    if (this._textDirty) {
      this._textDirty = false;
      const t = this._textEl;
      t.textContent = this._text;
      t.setAttribute('x', this._textX.toString());
      t.setAttribute('y', this._textY.toString());
      t.setAttribute('text-anchor', this._textAnchor);
      t.setAttribute('font-size', this._fontSize);
      t.setAttribute('font-family', this._fontFamily);
      t.setAttribute('fill', this._fill);
      if (this._stroke) {
        t.setAttribute('stroke', this._stroke);
        t.setAttribute('stroke-width', this._strokeWidth.toString());
      }
      if (this._paintOrder) {
        t.setAttribute('paint-order', this._paintOrder);
      }
    }
  }
}

/**
 * Renders an SVG <line> element. Used for grid lines and decorative lines.
 */
export class LineNode extends SceneNode {
  private readonly _lineEl: SVGLineElement;
  private _x1 = 0;
  private _y1 = 0;
  private _x2 = 0;
  private _y2 = 0;
  private _stroke = '#ccc';
  private _strokeWidth = 1;
  private _lineDirty = true;

  constructor() {
    super();
    this._lineEl = document.createElementNS(SVG_NS, 'line');
    this.el.appendChild(this._lineEl);
  }

  get x1() { return this._x1; }
  set x1(v: number) { if (v !== this._x1) { this._x1 = v; this._lineDirty = true; } }

  get y1() { return this._y1; }
  set y1(v: number) { if (v !== this._y1) { this._y1 = v; this._lineDirty = true; } }

  get x2() { return this._x2; }
  set x2(v: number) { if (v !== this._x2) { this._x2 = v; this._lineDirty = true; } }

  get y2() { return this._y2; }
  set y2(v: number) { if (v !== this._y2) { this._y2 = v; this._lineDirty = true; } }

  get lineStroke() { return this._stroke; }
  set lineStroke(v: string) { if (v !== this._stroke) { this._stroke = v; this._lineDirty = true; } }

  get lineStrokeWidth() { return this._strokeWidth; }
  set lineStrokeWidth(v: number) { if (v !== this._strokeWidth) { this._strokeWidth = v; this._lineDirty = true; } }

  override syncDOM(): void {
    super.syncDOM();
    if (this._lineDirty) {
      this._lineDirty = false;
      const l = this._lineEl;
      l.setAttribute('x1', this._x1.toString());
      l.setAttribute('y1', this._y1.toString());
      l.setAttribute('x2', this._x2.toString());
      l.setAttribute('y2', this._y2.toString());
      l.setAttribute('stroke', this._stroke);
      l.setAttribute('stroke-width', this._strokeWidth.toString());
    }
  }
}
