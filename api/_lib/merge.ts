import type { CleanObj } from '../../src/types';

/**
 * Sync document shared by every device. Merging is last-writer-wins per object,
 * with two independent field groups so a layout edit on one device and a
 * "cleaned" tap on another never clobber each other:
 *   - editedAt       → shape, position, name, schedule, kind
 *   - cleanEditedAt  → lastCleaned, history
 * Deletions are kept as tombstones (id → deletedAt).
 * The merge is commutative and idempotent, so devices converge no matter
 * what order syncs happen in.
 */

export interface PlanImageRef {
  id: string;
  width: number;
  height: number;
}

export interface SyncPlan {
  image: PlanImageRef | null;
  opacity: number;
  editedAt: number;
}

export interface SyncDoc {
  v: 1;
  objects: CleanObj[];
  deleted: Record<string, number>;
  plan: SyncPlan;
}

export interface StoredImage extends PlanImageRef {
  src: string;
}

const TOMBSTONE_TTL = 365 * 86_400_000;

export const emptyDoc = (): SyncDoc => ({
  v: 1,
  objects: [],
  deleted: {},
  plan: { image: null, opacity: 1, editedAt: 0 },
});

export function docHasContent(d: SyncDoc | null | undefined): boolean {
  return !!d && (d.objects.length > 0 || !!d.plan.image);
}

function mergeObj(a: CleanObj, b: CleanObj): CleanObj {
  const layout = (b.editedAt ?? 0) > (a.editedAt ?? 0) ? b : a;
  const clean = (b.cleanEditedAt ?? 0) > (a.cleanEditedAt ?? 0) ? b : a;
  return {
    ...layout,
    lastCleaned: clean.lastCleaned,
    history: clean.history,
    cleanEditedAt: clean.cleanEditedAt ?? 0,
  };
}

export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  const cutoff = Date.now() - TOMBSTONE_TTL;
  const deleted: Record<string, number> = {};
  for (const src of [a.deleted, b.deleted]) {
    for (const [id, t] of Object.entries(src)) {
      if (t > cutoff) deleted[id] = Math.max(deleted[id] ?? 0, t);
    }
  }

  const byId = new Map<string, CleanObj>();
  for (const o of a.objects) byId.set(o.id, o);
  for (const o of b.objects) {
    const x = byId.get(o.id);
    byId.set(o.id, x ? mergeObj(x, o) : o);
  }
  const objects = [...byId.values()].filter((o) => !(o.id in deleted && deleted[o.id] >= (o.editedAt ?? 0)));

  const plan = (b.plan.editedAt ?? 0) > (a.plan.editedAt ?? 0) ? b.plan : a.plan;
  return { v: 1, objects, deleted, plan };
}

const isNum = (n: unknown) => typeof n === 'number' && Number.isFinite(n);

export function isSyncDoc(d: unknown): d is SyncDoc {
  if (!d || typeof d !== 'object') return false;
  const doc = d as SyncDoc;
  if (!Array.isArray(doc.objects) || typeof doc.deleted !== 'object' || !doc.plan) return false;
  if (!isNum(doc.plan.opacity) || !isNum(doc.plan.editedAt)) return false;
  return doc.objects.every(
    (o) =>
      o &&
      typeof o.id === 'string' &&
      (o.kind === 'room' || o.kind === 'item') &&
      ['rect', 'ellipse', 'triangle'].includes(o.shape) &&
      [o.x, o.y, o.w, o.h, o.intervalDays].every(isNum) &&
      typeof o.name === 'string' &&
      Array.isArray(o.history),
  );
}
