import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { assignRooms, isPlacementValid } from './geometry';
import type { CleanObj, ExportData, FloorImage, Mode, ObjKind, Tool } from './types';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

interface State {
  // persisted
  objects: CleanObj[];
  /** Tombstones for synced deletes: id → deletedAt. */
  deleted: Record<string, number>;
  image: FloorImage | null;
  imageOpacity: number;
  /** When the plan image/opacity last changed (sync LWW). */
  planEditedAt: number;
  started: boolean;
  mode: Mode;
  /** Show "days since cleaned" under names on the plan (per device, not synced). */
  showDays: boolean;
  // session-only
  sync: { status: SyncStatus; lastSynced: number | null; message: string | null };
  syncDialogOpen: boolean;
  tool: Tool;
  drawKind: ObjKind;
  selectedId: string | null;
  past: CleanObj[][];
  future: CleanObj[][];
  fitNonce: number;
  toast: Toast | null;

  start: (image: FloorImage | null) => void;
  setImage: (image: FloorImage | null) => void;
  setImageOpacity: (v: number) => void;
  setMode: (m: Mode) => void;
  setShowDays: (v: boolean) => void;
  setTool: (t: Tool) => void;
  setDrawKind: (k: ObjKind) => void;
  select: (id: string | null) => void;
  requestFit: () => void;
  showToast: (message: string, action?: Toast['action']) => void;
  clearToast: () => void;

  /** Replace objects, recording an undo step. */
  commit: (objects: CleanObj[]) => void;
  /** Snapshot current objects for undo before a series of unrecorded edits. */
  checkpoint: () => void;
  addObject: (o: CleanObj) => void;
  /** Patch without validation or undo (text fields). */
  patchQuiet: (id: string, patch: Partial<CleanObj>) => void;
  /** Patch geometry/kind, rejecting it if the placement becomes invalid. */
  tryPatch: (id: string, patch: Partial<CleanObj>) => boolean;
  deleteObject: (id: string) => void;
  markCleaned: (id: string) => void;
  setLastCleaned: (id: string, when: number | null) => void;
  undo: () => void;
  redo: () => void;
  importData: (d: ExportData) => void;
  resetAll: () => void;
  setSync: (patch: Partial<State['sync']>) => void;
  setSyncDialogOpen: (open: boolean) => void;
}

/** localStorage wrapper that surfaces quota errors instead of throwing mid-render. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      window.dispatchEvent(new CustomEvent('cleanup:storage-error'));
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

let toastSeq = 1;

/** Undo should never roll back cleaning records, only layout/schedule edits. */
function keepCleaning(snapshot: CleanObj[], current: CleanObj[]): CleanObj[] {
  const byId = new Map(current.map((o) => [o.id, o]));
  return snapshot.map((o) => {
    const cur = byId.get(o.id);
    return cur ? { ...o, lastCleaned: cur.lastCleaned, history: cur.history } : o;
  });
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      objects: [],
      deleted: {},
      image: null,
      imageOpacity: 1,
      planEditedAt: 0,
      started: false,
      mode: 'setup',
      showDays: true,
      sync: { status: 'off', lastSynced: null, message: null },
      syncDialogOpen: false,
      tool: 'select',
      drawKind: 'room',
      selectedId: null,
      past: [],
      future: [],
      fitNonce: 0,
      toast: null,

      start: (image) => set((s) => ({ started: true, image, mode: 'setup', fitNonce: s.fitNonce + 1 })),
      setImage: (image) => set((s) => ({ image, fitNonce: s.fitNonce + 1 })),
      setImageOpacity: (imageOpacity) => set({ imageOpacity }),
      setMode: (mode) => set({ mode, tool: 'select', selectedId: null }),
      setShowDays: (showDays) => set({ showDays }),
      setTool: (tool) => set({ tool, selectedId: tool === 'select' ? get().selectedId : null }),
      setDrawKind: (drawKind) => set({ drawKind }),
      select: (selectedId) => set({ selectedId }),
      requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
      showToast: (message, action) => set({ toast: { id: toastSeq++, message, action } }),
      clearToast: () => set({ toast: null }),

      commit: (objects) =>
        set((s) => ({
          objects: assignRooms(objects),
          past: [...s.past, s.objects].slice(-100),
          future: [],
        })),
      checkpoint: () => set((s) => ({ past: [...s.past, s.objects].slice(-100), future: [] })),
      addObject: (o) => {
        get().commit([...get().objects, o]);
        set({ selectedId: o.id });
      },
      patchQuiet: (id, patch) =>
        set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      tryPatch: (id, patch) => {
        const { objects, commit, showToast } = get();
        const cur = objects.find((o) => o.id === id);
        if (!cur) return false;
        const next = { ...cur, ...patch };
        if (!isPlacementValid(next, objects)) {
          showToast(next.kind === 'room' ? 'Rooms can’t overlap other rooms.' : 'Items must sit inside a room.');
          return false;
        }
        commit(objects.map((o) => (o.id === id ? next : o)));
        return true;
      },
      deleteObject: (id) => {
        const { objects, commit } = get();
        commit(objects.filter((o) => o.id !== id && !(o.kind === 'item' && o.roomId === id)));
        set({ selectedId: null });
      },
      markCleaned: (id) => {
        const prev = get().objects.find((o) => o.id === id);
        if (!prev) return;
        const now = Date.now();
        set((s) => ({
          objects: s.objects.map((o) =>
            o.id === id ? { ...o, lastCleaned: now, history: [...o.history, now].slice(-200) } : o,
          ),
        }));
        get().showToast(`${prev.name || 'Item'} marked clean`, {
          label: 'Undo',
          run: () =>
            set((s) => ({
              objects: s.objects.map((o) =>
                o.id === id ? { ...o, lastCleaned: prev.lastCleaned, history: prev.history } : o,
              ),
            })),
        });
      },
      setLastCleaned: (id, when) =>
        set((s) => ({
          objects: s.objects.map((o) =>
            o.id === id
              ? { ...o, lastCleaned: when, history: when === null ? [] : [...o.history, when].slice(-200) }
              : o,
          ),
        })),
      undo: () => {
        const { past, objects, future } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        set({
          objects: keepCleaning(prev, objects),
          past: past.slice(0, -1),
          future: [objects, ...future].slice(0, 100),
          selectedId: null,
        });
      },
      redo: () => {
        const { past, objects, future } = get();
        if (!future.length) return;
        const next = future[0];
        set({
          objects: keepCleaning(next, objects),
          past: [...past, objects],
          future: future.slice(1),
          selectedId: null,
        });
      },
      importData: (d) =>
        set((s) => ({
          objects: assignRooms(d.objects.map(normalizeObj)),
          image: d.image ? { ...d.image, id: d.image.id ?? newId() } : null,
          imageOpacity: d.imageOpacity ?? 1,
          started: true,
          selectedId: null,
          past: [],
          future: [],
          fitNonce: s.fitNonce + 1,
        })),
      resetAll: () =>
        set({
          objects: [],
          image: null,
          imageOpacity: 1,
          started: false,
          mode: 'setup',
          tool: 'select',
          selectedId: null,
          past: [],
          future: [],
        }),
      setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
      setSyncDialogOpen: (syncDialogOpen) => set({ syncDialogOpen }),
    }),
    {
      name: 'cleanup-house-v1',
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        objects: s.objects,
        deleted: s.deleted,
        image: s.image,
        imageOpacity: s.imageOpacity,
        planEditedAt: s.planEditedAt,
        started: s.started,
        mode: s.mode,
        showDays: s.showDays,
      }),
      migrate: (persisted) => {
        const p = persisted as Partial<State>;
        return {
          ...p,
          objects: (p.objects ?? []).map(normalizeObj),
          deleted: p.deleted ?? {},
          planEditedAt: p.planEditedAt ?? 0,
          showDays: p.showDays ?? true,
          image: p.image ? { ...p.image, id: p.image.id ?? newId() } : null,
        } as State;
      },
    },
  ),
);

function normalizeObj(o: CleanObj): CleanObj {
  return { ...o, editedAt: o.editedAt ?? 0, cleanEditedAt: o.cleanEditedAt ?? 0 };
}

// ---------- Sync bookkeeping ----------
// Every local change to objects or the plan is stamped here, in one place, so the
// rest of the app never has to think about sync. Remote merges bypass stamping.

let applyingRemote = false;
let localChangeListener: (() => void) | null = null;

export function applyRemote(fn: () => void) {
  applyingRemote = true;
  try {
    fn();
  } finally {
    applyingRemote = false;
  }
}

export function onLocalChange(fn: () => void) {
  localChangeListener = fn;
}

const layoutDiffers = (a: CleanObj, b: CleanObj) =>
  a.kind !== b.kind ||
  a.shape !== b.shape ||
  a.x !== b.x ||
  a.y !== b.y ||
  a.w !== b.w ||
  a.h !== b.h ||
  a.orient !== b.orient ||
  a.right !== b.right ||
  a.name !== b.name ||
  a.intervalDays !== b.intervalDays;

const cleaningDiffers = (a: CleanObj, b: CleanObj) => a.lastCleaned !== b.lastCleaned || a.history !== b.history;

useStore.subscribe((s, prev) => {
  if (applyingRemote) return;
  const objsChanged = s.objects !== prev.objects;
  const planChanged = s.image?.id !== prev.image?.id || s.imageOpacity !== prev.imageOpacity;
  if (!objsChanged && !planChanged) return;

  const now = Date.now();
  const patch: Partial<State> = {};
  let changed = false;

  if (objsChanged) {
    const prevById = new Map(prev.objects.map((o) => [o.id, o]));
    let stamped = false;
    const objects = s.objects.map((o) => {
      const p = prevById.get(o.id);
      let n = o;
      if (!p || layoutDiffers(p, o)) n = { ...n, editedAt: now };
      if (p && cleaningDiffers(p, o)) n = { ...n, cleanEditedAt: now };
      if (n !== o) stamped = true;
      return n;
    });
    const ids = new Set(s.objects.map((o) => o.id));
    const removed = prev.objects.filter((o) => !ids.has(o.id));
    if (stamped) patch.objects = objects;
    if (removed.length) {
      patch.deleted = { ...s.deleted };
      for (const o of removed) patch.deleted[o.id] = now;
    }
    changed = stamped || removed.length > 0;
  }
  if (planChanged) {
    patch.planEditedAt = now;
    changed = true;
  }
  if (Object.keys(patch).length) useStore.setState(patch);
  if (changed) localChangeListener?.();
});

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function defaultName(kind: ObjKind, objects: CleanObj[]): string {
  const n = objects.filter((o) => o.kind === kind).length + 1;
  return kind === 'room' ? `Room ${n}` : `Item ${n}`;
}
