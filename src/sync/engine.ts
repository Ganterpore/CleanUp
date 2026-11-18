import { docHasContent, mergeDocs, type StoredImage, type SyncDoc } from '../../api/_lib/merge';
import { assignRooms } from '../geometry';
import { applyRemote, onLocalChange, useStore } from '../store';
import type { FloorImage } from '../types';

const CFG_KEY = 'cleanup-sync-v1';
const POLL_MS = 30_000;
const DEBOUNCE_MS = 1_200;

interface SyncConfig {
  password: string;
  /** Image ids this device knows the server already has. */
  imageIds: string[];
}

export class SyncError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function readCfg(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}
function writeCfg(cfg: SyncConfig | null) {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CFG_KEY);
  } catch {
    /* ignore */
  }
}
export const isSyncConfigured = () => readCfg() !== null;

async function api<T>(path: string, password: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${password}` },
    });
  } catch {
    throw new SyncError(0, 'Can’t reach the sync server. Check your connection.');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (!isJson) throw new SyncError(res.status || 0, 'This deployment has no sync server (no /api functions).');
  const body = await res.json();
  if (!res.ok) throw new SyncError(res.status, body.message ?? `Sync failed (${res.status}).`);
  return body as T;
}

export function localDoc(): SyncDoc {
  const s = useStore.getState();
  return {
    v: 1,
    objects: s.objects,
    deleted: s.deleted,
    plan: {
      image: s.image ? { id: s.image.id, width: s.image.width, height: s.image.height } : null,
      opacity: s.imageOpacity,
      editedAt: s.planEditedAt,
    },
  };
}

/** Merge a remote doc into local state (fetching a new floor plan image if needed). */
async function applyDoc(remote: SyncDoc, cfg: SyncConfig) {
  // Fetch a changed image before merging so state is updated in one go.
  const wantImage = mergeDocs(localDoc(), remote).plan.image;
  let fetched: FloorImage | null = null;
  if (wantImage && wantImage.id !== useStore.getState().image?.id) {
    fetched = await api<StoredImage>(`/api/image?id=${encodeURIComponent(wantImage.id)}`, cfg.password);
    if (!cfg.imageIds.includes(fetched.id)) cfg.imageIds = [...cfg.imageIds, fetched.id].slice(-5);
    writeCfg(cfg);
  }

  const s = useStore.getState();
  const merged = mergeDocs(localDoc(), remote);
  const objects = assignRooms(merged.objects);
  const objsChanged = JSON.stringify(objects) !== JSON.stringify(s.objects);
  const ref = merged.plan.image;
  let image = s.image;
  if ((ref?.id ?? null) !== (s.image?.id ?? null)) {
    if (!ref) image = null;
    else if (fetched?.id === ref.id) image = fetched;
  }

  applyRemote(() =>
    useStore.setState({
      objects: objsChanged ? objects : s.objects,
      deleted: merged.deleted,
      image,
      imageOpacity: merged.plan.opacity,
      planEditedAt: merged.plan.editedAt,
      started: s.started || objects.length > 0 || !!image,
      ...(objsChanged ? { past: [], future: [] } : {}),
      ...(image?.id !== s.image?.id ? { fitNonce: s.fitNonce + 1 } : {}),
    }),
  );
}

let inFlight = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function syncNow(): Promise<void> {
  const cfg = readCfg();
  const st = useStore.getState();
  if (!cfg) {
    st.setSync({ status: 'off' });
    return;
  }
  if (inFlight) {
    again = true;
    return;
  }
  inFlight = true;
  st.setSync({ status: 'syncing' });
  try {
    const img = useStore.getState().image;
    if (img && !cfg.imageIds.includes(img.id)) {
      await api('/api/image', cfg.password, { method: 'PUT', body: JSON.stringify(img) });
      cfg.imageIds = [...cfg.imageIds, img.id].slice(-5);
      writeCfg(cfg);
    }
    const res = await api<{ doc: SyncDoc }>('/api/sync', cfg.password, {
      method: 'POST',
      body: JSON.stringify({ doc: localDoc() }),
    });
    await applyDoc(res.doc, cfg);
    useStore.getState().setSync({ status: 'idle', lastSynced: Date.now(), message: null });
  } catch (e) {
    const err = e as SyncError;
    useStore.getState().setSync({
      status: err.status === 0 ? 'offline' : 'error',
      message: err.message,
    });
  } finally {
    inFlight = false;
    if (again) {
      again = false;
      scheduleSync(200);
    }
  }
}

export function scheduleSync(delay = DEBOUNCE_MS) {
  if (!readCfg()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delay);
}

let started = false;
export function startSyncLoop() {
  if (started) return;
  started = true;
  onLocalChange(() => scheduleSync());
  const kick = () => document.visibilityState === 'visible' && scheduleSync(0);
  document.addEventListener('visibilitychange', kick);
  window.addEventListener('focus', kick);
  window.addEventListener('online', kick);
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), POLL_MS);
  if (readCfg()) void syncNow();
}

// ---------- connecting ----------

export type ConnectResult = { kind: 'done' } | { kind: 'conflict'; remote: SyncDoc };

/** Check the password and decide whether the two houses need reconciling. */
export async function connect(password: string): Promise<ConnectResult> {
  const { doc } = await api<{ doc: SyncDoc | null }>('/api/sync', password);
  if (docHasContent(doc) && docHasContent(localDoc())) return { kind: 'conflict', remote: doc! };
  writeCfg({ password, imageIds: [] });
  await syncNow();
  return { kind: 'done' };
}

export type ConflictChoice = 'cloud' | 'device' | 'merge';

export async function resolveConflict(password: string, choice: ConflictChoice, remote: SyncDoc) {
  const now = Date.now();
  if (choice === 'cloud') {
    // Drop this device's house without tombstoning it, then pull the cloud copy.
    applyRemote(() =>
      useStore.setState({
        objects: [],
        deleted: {},
        image: null,
        planEditedAt: 0,
        selectedId: null,
        past: [],
        future: [],
      }),
    );
  } else if (choice === 'device') {
    // Tombstone everything the cloud has that this device doesn't, and make this plan win.
    const s = useStore.getState();
    const local = new Set(s.objects.map((o) => o.id));
    const deleted = { ...s.deleted };
    for (const o of remote.objects) if (!local.has(o.id)) deleted[o.id] = now;
    applyRemote(() =>
      useStore.setState({
        deleted,
        planEditedAt: now,
        objects: s.objects.map((o) => ({ ...o, editedAt: now, cleanEditedAt: now })),
      }),
    );
  }
  writeCfg({ password, imageIds: [] });
  await syncNow();
}

export function disconnect() {
  writeCfg(null);
  useStore.getState().setSync({ status: 'off', lastSynced: null, message: null });
}
