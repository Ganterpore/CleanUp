import { useState } from 'react';
import { loadFloorImage, parseExport, pickFile } from '../imageLoad';
import { useStore } from '../store';
import { Icon } from './Icon';

export function Welcome() {
  const start = useStore((s) => s.start);
  const importData = useStore((s) => s.importData);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    setBusy(true);
    try {
      start(await loadFloorImage(f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      importData(parseExport(await f.text()));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>CleanUp</h1>
        <p className="lead">
          Map your home, set how often each room and fixture needs cleaning, and watch what’s overdue turn red.
        </p>
        <div className="welcome-actions">
          <button className="btn primary big" onClick={upload} disabled={busy}>
            <Icon name="image" /> {busy ? 'Loading…' : 'Upload a floor plan'}
          </button>
          <button className="btn big" onClick={() => start(null)}>
            <Icon name="rect" /> Start with a blank canvas
          </button>
        </div>
        <div className="welcome-links">
          <button className="link" onClick={() => useStore.getState().setSyncDialogOpen(true)}>
            Connect to a synced house
          </button>
          <span className="meta">·</span>
          <button className="link" onClick={restore}>
            Restore from a backup file
          </button>
        </div>
        {error && <p className="warn">{error}</p>}
        <p className="fine">Your house is saved in this browser. Turn on sync to share it across devices.</p>
      </div>
    </div>
  );
}
