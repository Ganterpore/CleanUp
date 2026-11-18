import { useEffect, useState } from 'react';
import { FloorCanvas } from './components/FloorCanvas';
import { Header } from './components/Header';
import { Icon } from './components/Icon';
import { SetupPanel } from './components/SetupPanel';
import { ToolPalette } from './components/ToolPalette';
import { TrackPanel } from './components/TrackPanel';
import { Welcome } from './components/Welcome';
import { useStore } from './store';
import type { Tool } from './types';

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(Date.now());
  const objects = useStore((s) => s.objects);
  useEffect(() => setNow(Date.now()), [objects]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const onVis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);
  return now;
}

const KEY_TOOLS: Record<string, Tool> = { v: 'select', r: 'rect', t: 'triangle', o: 'ellipse' };

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      const s = useStore.getState();
      if (s.mode !== 'setup' || !s.started) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        e.preventDefault();
        const o = s.objects.find((x) => x.id === s.selectedId);
        const kids = s.objects.filter((x) => x.kind === 'item' && x.roomId === s.selectedId).length;
        if (o && (!kids || confirm(`Delete ${o.name} and the ${kids} item${kids > 1 ? 's' : ''} inside it?`))) {
          s.deleteObject(o.id);
        }
      } else if (e.key === 'Escape') {
        s.setTool('select');
        s.select(null);
      } else if (!mod && KEY_TOOLS[e.key.toLowerCase()]) {
        s.setTool(KEY_TOOLS[e.key.toLowerCase()]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function ToastHost() {
  const toast = useStore((s) => s.toast);
  const clear = useStore((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clear, toast.action ? 5000 : 3000);
    return () => clearTimeout(id);
  }, [toast, clear]);
  useEffect(() => {
    const onErr = () => useStore.getState().showToast('Browser storage is full; changes may not be saved. Try a smaller image.');
    window.addEventListener('cleanup:storage-error', onErr);
    return () => window.removeEventListener('cleanup:storage-error', onErr);
  }, []);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run();
            clear();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

function CanvasHint() {
  const mode = useStore((s) => s.mode);
  const tool = useStore((s) => s.tool);
  const drawKind = useStore((s) => s.drawKind);
  const hasRooms = useStore((s) => s.objects.some((o) => o.kind === 'room'));
  const empty = useStore((s) => s.objects.length === 0);
  let text: string | null = null;
  if (mode === 'setup') {
    if (tool !== 'select') {
      text =
        drawKind === 'item' && !hasRooms
          ? 'Draw a room first. Items have to sit inside rooms.'
          : `Drag to draw ${drawKind === 'room' ? 'a room' : 'an item inside a room'} · Shift for even sides · Esc to stop`;
    } else if (empty) text = 'Pick a shape on the left to start drawing rooms';
  } else if (empty) text = 'Nothing to track yet. Switch to Setup to draw your house.';
  return text ? <div className="canvas-hint">{text}</div> : null;
}

export default function App() {
  const started = useStore((s) => s.started);
  const mode = useStore((s) => s.mode);
  const selectedId = useStore((s) => s.selectedId);
  const now = useNow();
  const [panelOpen, setPanelOpen] = useState(true);
  useShortcuts();

  // On phones, opening an object's editor should reveal the panel.
  useEffect(() => {
    if (selectedId) setPanelOpen(true);
  }, [selectedId]);

  if (!started) return <Welcome />;

  return (
    <div className={`app mode-${mode}`}>
      <Header />
      <main className="main">
        <div className="stage-wrap">
          <FloorCanvas now={now} />
          {mode === 'setup' && <ToolPalette />}
          <CanvasHint />
        </div>
        <aside className={`panel ${panelOpen ? 'open' : 'closed'}`}>
          <button className="panel-toggle" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen}>
            <Icon name="list" size={16} />
            {mode === 'setup' ? (selectedId ? 'Edit' : 'House') : 'To clean'}
            <span className="chev">
              <Icon name="chevron" size={16} />
            </span>
          </button>
          <div className="panel-scroll">{mode === 'setup' ? <SetupPanel now={now} /> : <TrackPanel now={now} />}</div>
        </aside>
      </main>
      <ToastHost />
    </div>
  );
}
