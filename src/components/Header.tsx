import { useEffect, useRef, useState } from 'react';
import { downloadJson, loadFloorImage, parseExport, pickFile } from '../imageLoad';
import { useStore } from '../store';
import { isSyncConfigured } from '../sync/engine';
import { Icon } from './Icon';
import { SyncButton } from './SyncDialog';

export function Header() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const requestFit = useStore((s) => s.requestFit);
  const showDays = useStore((s) => s.showDays);
  const setShowDays = useStore((s) => s.setShowDays);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const run = (fn: () => void | Promise<void>) => () => {
    setMenuOpen(false);
    void fn();
  };

  const exportData = () => {
    const s = useStore.getState();
    downloadJson({ app: 'cleanup', version: 1, objects: s.objects, image: s.image, imageOpacity: s.imageOpacity });
  };
  const importData = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const d = parseExport(await f.text());
      if (useStore.getState().objects.length && !confirm('Replace your current house with this backup?')) return;
      useStore.getState().importData(d);
      useStore.getState().showToast('Backup restored');
    } catch (err) {
      useStore.getState().showToast((err as Error).message);
    }
  };
  const replaceImage = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try {
      useStore.getState().setImage(await loadFloorImage(f));
    } catch (err) {
      useStore.getState().showToast((err as Error).message);
    }
  };
  const startOver = () => {
    const msg = isSyncConfigured()
      ? 'Delete your whole house layout and cleaning history on EVERY synced device? Consider exporting a backup first.'
      : 'Delete your whole house layout and cleaning history? Consider exporting a backup first.';
    if (confirm(msg)) {
      useStore.getState().resetAll();
    }
  };

  return (
    <header className="header">
      <div className="brand">
        <img src="/icon.svg" alt="" width={26} height={26} />
        <span>CleanUp</span>
      </div>
      <div className="segmented mode-toggle" role="tablist" aria-label="Mode">
        <button role="tab" aria-selected={mode === 'setup'} className={mode === 'setup' ? 'on' : ''} onClick={() => setMode('setup')}>
          <Icon name="edit" size={16} /> Setup
        </button>
        <button role="tab" aria-selected={mode === 'track'} className={mode === 'track' ? 'on' : ''} onClick={() => setMode('track')}>
          <Icon name="check" size={16} /> Track
        </button>
      </div>
      <div className="header-actions">
        <SyncButton />
        <button className="icon-btn" title="Fit to screen" onClick={requestFit}>
          <Icon name="fit" />
        </button>
        <div className="menu-wrap" ref={menuRef}>
          <button className="icon-btn" title="More" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <Icon name="menu" />
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button role="menuitem" onClick={run(replaceImage)}>
                {useStore.getState().image ? 'Replace floor plan image…' : 'Add floor plan image…'}
              </button>
              <button role="menuitemcheckbox" aria-checked={showDays} className="check-item" onClick={run(() => setShowDays(!showDays))}>
                <span className="check-box">{showDays && <Icon name="check" size={14} />}</span>
                Show days since cleaned
              </button>
              <hr />
              <button role="menuitem" onClick={run(exportData)}>Export backup</button>
              <button role="menuitem" onClick={run(importData)}>Import backup…</button>
              <hr />
              <button role="menuitem" className="danger" onClick={run(startOver)}>Start over</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
