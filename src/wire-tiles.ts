/**
 * Wire Tile Classification & Node Creation
 *
 * Tiling algorithm
 * ────────────────
 * Each wire cell examines its 4 cardinal neighbours (N/E/S/W) to produce a
 * connectivity bitmask.  The 16 possible bitmasks reduce to 6 shape classes:
 *
 *   isolated  – 0 connections        – drawn programmatically (hub dot)
 *   cap       – 1 connection         – drawn programmatically (segment + hub dot)
 *   straight  – 2 opposite (N+S / E+W)
 *   corner    – 2 adjacent pairs
 *   tee       – 3 connections
 *   cross     – 4 connections
 *
 * Sprite assets (in /public/icons/) are authored in a canonical orientation:
 *
 *   straight  → wire.svg         canonical: E+W  (horizontal)
 *   corner    → wire-turn.svg    canonical: S+E  (bottom → right)
 *   tee       → wire-t3.svg      canonical: E+S+W (missing N)
 *   cross     → wire-t4.svg      canonical: all 4
 *
 * Rotation table (clockwise, matching SpriteNode.imgRotation):
 *
 *   straight  E+W→0°,  N+S→90°
 *   corner    S+E→0°,  S+W→90°,  N+W→180°, N+E→270°
 *   tee       !N→0°,   !E→90°,   !S→180°,  !W→270°
 *   cross     always 0°
 */

import { CELL_SIZE } from './types.ts';
import type { SceneNode } from './scene.ts';
import { GroupNode, SpriteNode } from './scene.ts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WireVariant = 'isolated' | 'cap' | 'straight' | 'corner' | 'tee' | 'cross';

export interface WireConnectivity {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export interface WireTileResult {
  variant: WireVariant;
  rotation: 0 | 90 | 180 | 270;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

// SVG icon paths for every wire variant.
const WIRE_ICONS: Record<WireVariant, string> = {
  isolated: '/icons/wire-isolated.svg',
  cap:      '/icons/wire-cap.svg',
  straight: '/icons/wire.svg',
  corner:   '/icons/wire-turn.svg',
  tee:      '/icons/wire-t3.svg',
  cross:    '/icons/wire-t4.svg',
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export function classifyWireTile(
  n: boolean, e: boolean, s: boolean, w: boolean,
): WireTileResult {
  const count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);

  if (count === 0) {
    return { variant: 'isolated', rotation: 0 };
  }

  if (count === 1) {
    const rotation: 0 | 90 | 180 | 270 = e ? 0 : s ? 90 : w ? 180 : 270;
    return { variant: 'cap', rotation };
  }

  if (count === 2) {
    // Straight: two opposite sides
    if (e && w) return { variant: 'straight', rotation: 0 };
    if (n && s) return { variant: 'straight', rotation: 90 };

    // Corner: two adjacent sides
    // Canonical is S+E (wire-turn.svg: curve from south edge to east edge)
    if (s && e) return { variant: 'corner', rotation: 0 };
    if (s && w) return { variant: 'corner', rotation: 90 };
    if (n && w) return { variant: 'corner', rotation: 180 };
    /* n && e */ return { variant: 'corner', rotation: 270 };
  }

  if (count === 3) {
    // Canonical T is E+S+W (missing N) → 0°
    if (!n) return { variant: 'tee', rotation: 0 };
    if (!e) return { variant: 'tee', rotation: 90 };
    if (!s) return { variant: 'tee', rotation: 180 };
    /* !w */ return { variant: 'tee', rotation: 270 };
  }

  // count === 4
  return { variant: 'cross', rotation: 0 };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createWireTileNode(
  gridX: number,
  gridY: number,
  conn: WireConnectivity,
): SceneNode {
  const group = new GroupNode();
  const x = gridX * CELL_SIZE;
  const y = gridY * CELL_SIZE;
  const cx = x + CELL_SIZE / 2;
  const cy = y + CELL_SIZE / 2;

  const { variant, rotation } = classifyWireTile(conn.n, conn.e, conn.s, conn.w);

  const sprite = new SpriteNode();
  sprite.href = WIRE_ICONS[variant];
  sprite.imgX = x;
  sprite.imgY = y;
  sprite.width = CELL_SIZE;
  sprite.height = CELL_SIZE;
  sprite.imgRotation = rotation;
  sprite.imgPivotX = cx;
  sprite.imgPivotY = cy;
  group.addChild(sprite);

  return group;
}
