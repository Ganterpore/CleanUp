import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { assignRooms, isPlacementValid } from './geometry';
import type { CleanObj, ExportData, FloorImage, Mode, ObjKind, Tool } from './types';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface State {
  // persisted
  objects: CleanObj[];
  image: FloorImage | null;
  imageOpacity: number;
  started: boolean;
  mode: Mode;
  // session-only
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
      image: null,
      imageOpacity: 1,
      started: false,
      mode: 'setup',
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
          objects: assignRooms(d.objects),
          image: d.image,
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
    }),
    {
      name: 'cleanup-house-v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        objects: s.objects,
        image: s.image,
        imageOpacity: s.imageOpacity,
        started: s.started,
        mode: s.mode,
      }),
    },
  ),
);

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function defaultName(kind: ObjKind, objects: CleanObj[]): string {
  const n = objects.filter((o) => o.kind === kind).length + 1;
  return kind === 'room' ? `Room ${n}` : `Item ${n}`;
}
