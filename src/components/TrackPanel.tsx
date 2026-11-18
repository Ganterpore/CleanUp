import { everyText, lastCleanedText, staleness, stalenessColor } from '../freshness';
import { useStore, useTheme } from '../store';
import { Icon } from './Icon';

export function TrackPanel({ now }: { now: number }) {
  const objects = useStore((s) => s.objects);
  const markCleaned = useStore((s) => s.markCleaned);
  const setMode = useStore((s) => s.setMode);
  const theme = useTheme().canvas;
  const roomName = new Map(objects.filter((o) => o.kind === 'room').map((r) => [r.id, r.name]));

  const rows = objects
    .map((o) => ({ o, t: staleness(o, now) }))
    .sort((a, b) => b.t - a.t || a.o.name.localeCompare(b.o.name));
  const overdue = rows.filter((r) => r.t >= 0.5).length;

  if (!objects.length) {
    return (
      <div className="panel-body">
        <p className="hint">Nothing to track yet.</p>
        <button className="btn" onClick={() => setMode('setup')}>
          Set up your house
        </button>
      </div>
    );
  }

  return (
    <div className="panel-body">
      <section>
        <h2>{overdue === 0 ? 'All caught up ✨' : `${overdue} due or overdue`}</h2>
        <div className="legend">
          <div className="legend-bar" />
          <div className="legend-labels">
            <span>Just cleaned</span>
            <span>Due</span>
            <span>2× overdue</span>
          </div>
        </div>
        <p className="hint">Tap a room or item on the plan (or Done below) when you clean it.</p>
      </section>
      <ul className="todo">
        {rows.map(({ o, t }) => (
          <li key={o.id}>
            <span className="swatch" style={{ background: stalenessColor(t, theme) }} />
            <div className="todo-text">
              <div className="name">
                {o.name || 'Untitled'}
                {o.kind === 'item' && o.roomId && <span className="meta"> · {roomName.get(o.roomId)}</span>}
              </div>
              <div className="meta">
                {lastCleanedText(o, now)} · {everyText(o.intervalDays)}
              </div>
            </div>
            <button className="done-btn" onClick={() => markCleaned(o.id)} aria-label={`Mark ${o.name} cleaned`}>
              <Icon name="check" size={16} /> Done
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
