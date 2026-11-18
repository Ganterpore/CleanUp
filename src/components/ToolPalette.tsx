import { useStore } from '../store';
import type { Tool } from '../types';
import { Icon } from './Icon';

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'select', label: 'Select & move', key: 'V' },
  { tool: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'triangle', label: 'Triangle', key: 'T' },
  { tool: 'ellipse', label: 'Oval', key: 'O' },
];

export function ToolPalette() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const drawKind = useStore((s) => s.drawKind);
  const setDrawKind = useStore((s) => s.setDrawKind);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const hasRooms = useStore((s) => s.objects.some((o) => o.kind === 'room'));

  return (
    <div className="palette">
      <div className="segmented small" aria-label="What to draw">
        <button className={drawKind === 'room' ? 'on' : ''} onClick={() => setDrawKind('room')} title="Draw rooms">
          Room
        </button>
        <button
          className={drawKind === 'item' ? 'on' : ''}
          onClick={() => setDrawKind('item')}
          title={hasRooms ? 'Draw items inside rooms' : 'Draw a room first'}
        >
          Item
        </button>
      </div>
      <div className="palette-sep" />
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`tool-btn ${tool === t.tool ? 'on' : ''}`}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={tool === t.tool}
          onClick={() => setTool(t.tool)}
        >
          <Icon name={t.tool} />
        </button>
      ))}
      <div className="palette-sep" />
      <button className="tool-btn" title="Undo (⌘Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
        <Icon name="undo" />
      </button>
      <button className="tool-btn" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
        <Icon name="redo" />
      </button>
    </div>
  );
}
