import { useEffect, useState } from 'react';
import type { SyncDoc } from '../../api/_lib/merge';
import { useStore } from '../store';
import { connect, disconnect, isSyncConfigured, resolveConflict, syncNow, type ConflictChoice } from '../sync/engine';
import { Icon } from './Icon';

function ago(t: number | null): string {
  if (!t) return 'not yet';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return new Date(t).toLocaleString();
}

const STATUS_LABEL = {
  off: 'Not syncing',
  idle: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: 'Sync problem',
} as const;

export function SyncButton() {
  const status = useStore((s) => s.sync.status);
  const open = useStore((s) => s.setSyncDialogOpen);
  return (
    <button className={`icon-btn sync-btn s-${status}`} title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]} onClick={() => open(true)}>
      <Icon name="cloud" />
      <span className="sync-dot" />
    </button>
  );
}

export function SyncDialog() {
  const openState = useStore((s) => s.syncDialogOpen);
  const setOpen = useStore((s) => s.setSyncDialogOpen);
  const sync = useStore((s) => s.sync);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SyncDoc | null>(null);
  const [, tick] = useState(0);
  const connected = isSyncConfigured() && sync.status !== 'off';

  useEffect(() => {
    if (openState) setError(null);
  }, [openState]);

  useEffect(() => {
    if (!openState) return;
    const id = setInterval(() => tick((n) => n + 1), 5000);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [openState, busy, setOpen]);

  if (!openState) return null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setConflict(null);
    setPassword('');
  };

  const doConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const r = await connect(password);
      if (r.kind === 'conflict') setConflict(r.remote);
      else {
        useStore.getState().showToast('Sync connected');
        setOpen(false);
        setPassword('');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choose = async (choice: ConflictChoice) => {
    if (!conflict) return;
    if (choice === 'device' && !confirm('Replace the cloud house on every synced device with this device’s house?')) return;
    setBusy(true);
    try {
      await resolveConflict(password, choice, conflict);
      useStore.getState().showToast('Sync connected');
      setConflict(null);
      setPassword('');
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (conflict) {
    const n = conflict.objects.length;
    body = (
      <>
        <p className="hint">
          This device and the cloud both have a house. The cloud copy has {n} room{n === 1 ? '' : 's'} and item{n === 1 ? '' : 's'}
          {conflict.plan.image ? ' and a floor plan' : ''}. Which should you keep?
        </p>
        <div className="choice-list">
          <button className="choice" disabled={busy} onClick={() => choose('cloud')}>
            <b>Use the cloud house</b>
            <span>Replaces what’s on this device. Recommended for a second device.</span>
          </button>
          <button className="choice" disabled={busy} onClick={() => choose('device')}>
            <b>Use this device’s house</b>
            <span>Replaces the cloud copy on every synced device.</span>
          </button>
          <button className="choice" disabled={busy} onClick={() => choose('merge')}>
            <b>Combine both</b>
            <span>Keeps every room and item from both. You may get overlaps to tidy up.</span>
          </button>
        </div>
      </>
    );
  } else if (connected) {
    body = (
      <>
        <div className={`sync-status s-${sync.status}`}>
          <span className="sync-dot" />
          <div>
            <b>{STATUS_LABEL[sync.status]}</b>
            <div className="meta">Last synced {ago(sync.lastSynced)}</div>
          </div>
        </div>
        {sync.message && sync.status !== 'idle' && <p className="warn">{sync.message}</p>}
        <p className="hint">
          Changes on any device show up on the others within about 30 seconds, and straight away when you switch back to the app.
        </p>
        <div className="row">
          <button className="btn" disabled={sync.status === 'syncing'} onClick={() => void syncNow()}>
            Sync now
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              if (confirm('Stop syncing on this device? Your house stays here, but changes will no longer be shared.')) {
                disconnect();
              }
            }}
          >
            Disconnect this device
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <form onSubmit={doConnect} className="sync-form">
        <p className="hint">
          Share one house between your phone, laptop and anyone else in the home. Enter the sync password set as{' '}
          <code>CLEANUP_PASSWORD</code> on the server.
        </p>
        <label className="field">
          <span>Sync password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        {error && <p className="warn">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    );
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sync-title">
        <div className="modal-head">
          <h2 id="sync-title">Sync across devices</h2>
          <button className="icon-btn" onClick={close} aria-label="Close" disabled={busy}>
            <Icon name="close" size={16} />
          </button>
        </div>
        {body}
        {conflict && error && <p className="warn">{error}</p>}
      </div>
    </div>
  );
}
