import type { CleanObj } from './types';

export interface Pt {
  x: number;
  y: number;
}
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Geo = Pick<CleanObj, 'shape' | 'x' | 'y' | 'w' | 'h' | 'orient' | 'right'>;

const ELLIPSE_SEGS = 48;
export const MIN_SIZE = 8;

/** Convex polygon approximating the shape (ellipses become 48-gons). */
export function polygonOf(o: Geo): Pt[] {
  const { x, y, w, h } = o;
  if (o.shape === 'rect') {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  if (o.shape === 'ellipse') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const pts: Pt[] = [];
    for (let i = 0; i < ELLIPSE_SEGS; i++) {
      const a = (i / ELLIPSE_SEGS) * Math.PI * 2;
      pts.push({ x: cx + (Math.cos(a) * w) / 2, y: cy + (Math.sin(a) * h) / 2 });
    }
    return pts;
  }
  const corners: Pt[] = [
    { x, y }, // TL
    { x: x + w, y }, // TR
    { x: x + w, y: y + h }, // BR
    { x, y: y + h }, // BL
  ];
  const k = ((o.orient % 4) + 4) % 4;
  if (o.right) {
    // Right-angle corner rotates clockwise: BL → TL → TR → BR.
    const rightCorner = (k + 3) % 4;
    const opposite = (rightCorner + 2) % 4;
    return corners.filter((_, i) => i !== opposite);
  }
  // Isosceles: apex points up → right → down → left.
  switch (k) {
    case 0:
      return [{ x: x + w / 2, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    case 1:
      return [{ x: x + w, y: y + h / 2 }, { x, y: y + h }, { x, y }];
    case 2:
      return [{ x: x + w / 2, y: y + h }, { x, y }, { x: x + w, y }];
    default:
      return [{ x, y: y + h / 2 }, { x: x + w, y }, { x: x + w, y: y + h }];
  }
}

export function centerOf(o: Geo): Pt {
  if (o.shape === 'triangle') {
    const p = polygonOf(o);
    return {
      x: p.reduce((s, q) => s + q.x, 0) / p.length,
      y: p.reduce((s, q) => s + q.y, 0) / p.length,
    };
  }
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
}

export function areaOf(o: Geo): number {
  if (o.shape === 'rect') return o.w * o.h;
  if (o.shape === 'ellipse') return (Math.PI * o.w * o.h) / 4;
  return (o.w * o.h) / 2;
}

function project(poly: Pt[], ax: number, ay: number) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * ax + p.y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

function bboxesTouch(a: BBox, b: BBox, pad: number) {
  return a.x - pad <= b.x + b.w && b.x - pad <= a.x + a.w && a.y - pad <= b.y + b.h && b.y - pad <= a.y + a.h;
}

/**
 * Separating-axis test for convex polygons. Shapes that merely share an edge
 * (overlap depth ≤ tol) do not count as overlapping, so snapped walls are fine.
 */
export function shapesOverlap(a: Geo, b: Geo, tol = 0.5): boolean {
  if (!bboxesTouch(a, b, -tol)) return false;
  const pa = polygonOf(a);
  const pb = polygonOf(b);
  for (const poly of [pa, pb]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      let nx = -(p2.y - p1.y);
      let ny = p2.x - p1.x;
      const len = Math.hypot(nx, ny);
      if (len < 1e-9) continue;
      nx /= len;
      ny /= len;
      const ra = project(pa, nx, ny);
      const rb = project(pb, nx, ny);
      if (Math.min(ra.max, rb.max) - Math.max(ra.min, rb.min) <= tol) return false;
    }
  }
  return true;
}

export function pointInShape(p: Pt, o: Geo): boolean {
  if (p.x < o.x || p.x > o.x + o.w || p.y < o.y || p.y > o.y + o.h) return false;
  const poly = polygonOf(o);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The room (smallest, if nested somehow) whose shape contains the item's centre. */
export function roomForItem(item: Geo, rooms: CleanObj[]): CleanObj | null {
  const c = centerOf(item);
  let best: CleanObj | null = null;
  for (const r of rooms) {
    if (r.kind !== 'room') continue;
    if (pointInShape(c, r) && (!best || areaOf(r) < areaOf(best))) best = r;
  }
  return best;
}

/** Rooms may not overlap other rooms; items must sit inside a room. */
export function isPlacementValid(c: CleanObj, all: CleanObj[]): boolean {
  if (c.w < MIN_SIZE || c.h < MIN_SIZE) return false;
  if (c.kind === 'room') {
    return !all.some((o) => o.kind === 'room' && o.id !== c.id && shapesOverlap(c, o));
  }
  return roomForItem(
    c,
    all.filter((o) => o.id !== c.id),
  ) !== null;
}

export function assignRooms(objs: CleanObj[]): CleanObj[] {
  const rooms = objs.filter((o) => o.kind === 'room');
  return objs.map((o) => {
    if (o.kind === 'room') return o.roomId === null ? o : { ...o, roomId: null };
    const r = roomForItem(o, rooms);
    const roomId = r ? r.id : null;
    return roomId === o.roomId ? o : { ...o, roomId };
  });
}

// ---------- Snapping ("magnet" edges) ----------

function uniq(v: number[]) {
  return [...new Set(v.map((n) => Math.round(n * 1000) / 1000))];
}

export function snapXs(o: Geo): number[] {
  if (o.shape === 'triangle') return uniq(polygonOf(o).map((p) => p.x));
  return [o.x, o.x + o.w];
}
export function snapYs(o: Geo): number[] {
  if (o.shape === 'triangle') return uniq(polygonOf(o).map((p) => p.y));
  return [o.y, o.y + o.h];
}

export interface SnapHit {
  delta: number;
  at: number;
}

export function bestSnap(values: number[], targets: number[], thr: number): SnapHit | null {
  let best: SnapHit | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
    }
  }
  return best;
}

export interface Guides {
  x: number | null;
  y: number | null;
}

export function snapTranslate(c: Geo, others: Geo[], thr: number): { dx: number; dy: number; guides: Guides } {
  const near = others.filter((o) => bboxesTouch(c, o, thr));
  const sx = bestSnap(snapXs(c), near.flatMap(snapXs), thr);
  const sy = bestSnap(snapYs(c), near.flatMap(snapYs), thr);
  return {
    dx: sx?.delta ?? 0,
    dy: sy?.delta ?? 0,
    guides: { x: sx?.at ?? null, y: sy?.at ?? null },
  };
}

export function snapPoint(p: Pt, others: Geo[], thr: number): Pt & { guides: Guides } {
  const near = others.filter((o) => bboxesTouch({ x: p.x, y: p.y, w: 0, h: 0 }, o, thr));
  const sx = bestSnap([p.x], near.flatMap(snapXs), thr);
  const sy = bestSnap([p.y], near.flatMap(snapYs), thr);
  return {
    x: p.x + (sx?.delta ?? 0),
    y: p.y + (sy?.delta ?? 0),
    guides: { x: sx?.at ?? null, y: sy?.at ?? null },
  };
}

/** Snap a single moving edge (during resize) to nearby shapes' edges on the same axis. */
export function snapEdge(value: number, axis: 'x' | 'y', box: BBox, others: Geo[], thr: number): SnapHit | null {
  const near = others.filter((o) => bboxesTouch(box, o, thr));
  return bestSnap([value], near.flatMap(axis === 'x' ? snapXs : snapYs), thr);
}

/** Which shapes a moving/drawn object should magnet to. */
export function snapTargets(o: Pick<CleanObj, 'id' | 'kind'>, all: CleanObj[]): CleanObj[] {
  return o.kind === 'room'
    ? all.filter((x) => x.kind === 'room' && x.id !== o.id)
    : all.filter((x) => x.id !== o.id);
}

export function unionBBox(boxes: BBox[]): BBox | null {
  if (!boxes.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ---------- Label placement ----------

const rectGeo = (b: BBox): Geo => ({ shape: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, orient: 0, right: false });

/**
 * Find where to put a room's label (a lw × lh box) so it stays inside the room
 * and clear of the given obstacles (items). Tries the centre first, then the
 * nearest free spot on a grid. If nothing is clear, it picks the spot
 * furthest from the items' own labels. Returns the label's top-left, or null
 * if the label doesn't fit in the room at all (the caller then centres it).
 */
export function findLabelSpot(room: Geo, obstacles: Geo[], lw: number, lh: number, pad: number): Pt | null {
  if (lw > room.w || lh > room.h) return null;
  const roomBox = { x: room.x, y: room.y, w: room.w, h: room.h };
  const near = obstacles.filter((o) => bboxesTouch(roomBox, o, pad));
  const c = centerOf(room);

  const fits = (cx: number, cy: number) => {
    const box = { x: cx - lw / 2, y: cy - lh / 2, w: lw, h: lh };
    const corners = [
      { x: box.x, y: box.y },
      { x: box.x + lw, y: box.y },
      { x: box.x + lw, y: box.y + lh },
      { x: box.x, y: box.y + lh },
    ];
    if (!corners.every((p) => pointInShape(p, room))) return false;
    const padded = rectGeo({ x: box.x - pad, y: box.y - pad, w: lw + pad * 2, h: lh + pad * 2 });
    return !near.some((o) => shapesOverlap(padded, o, 0));
  };

  const candidates: Pt[] = [c];
  const steps = 14;
  const x0 = room.x + lw / 2;
  const x1 = room.x + room.w - lw / 2;
  const y0 = room.y + lh / 2;
  const y1 = room.y + room.h - lh / 2;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      candidates.push({ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * j) / steps });
    }
  }
  candidates.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));

  for (const p of candidates) if (fits(p.x, p.y)) return { x: p.x - lw / 2, y: p.y - lh / 2 };

  // No clear space: at least keep away from the items' own labels (drawn at their centres).
  const itemCentres = near.map(centerOf);
  if (!itemCentres.length) return null;
  const insideRoom = (p: Pt) =>
    [
      { x: p.x - lw / 2, y: p.y - lh / 2 },
      { x: p.x + lw / 2, y: p.y - lh / 2 },
      { x: p.x + lw / 2, y: p.y + lh / 2 },
      { x: p.x - lw / 2, y: p.y + lh / 2 },
    ].every((q) => pointInShape(q, room));
  let best: Pt | null = null;
  let bestScore = -Infinity;
  for (const p of candidates) {
    if (!insideRoom(p)) continue;
    // Distance in "label units", so vertical separation counts as much as horizontal.
    const score = Math.min(...itemCentres.map((q) => Math.max(Math.abs(p.x - q.x) / lw, Math.abs(p.y - q.y) / lh)));
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = p;
    }
  }
  return best ? { x: best.x - lw / 2, y: best.y - lh / 2 } : null;
}
