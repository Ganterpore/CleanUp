import { useState } from 'react';
import { everyText, lastCleanedText, staleness, stalenessColor } from '../freshness';
import { useStore, useTheme } from '../store';
import type { CleanObj } from '../types';
import { Icon } from './Icon';

const PRESETS = [1, 2, 3, 7, 14, 30, 90];
const SHAPE_NAME = { rect: 'Rectangle', ellipse: 'Oval', triangle: 'Triangle' } as const;

export function SetupPanel({ now }: { now: number }) {
  const selectedId = useStore((s) => s.selectedId);
  const obj = useStore((s) => s.objects.find((o) => o.id === s.selectedId));
  if (selectedId && obj) return <ObjectEditor key={obj.id} o={obj} now={now} />;
  return <Overview />;
}

function Overview() {
  const objects = useStore((s) => s.objects);
  const image = useStore((s) => s.image);
  const imageOpacity = useStore((s) => s.imageOpacity);
  const setImageOpacity = useStore((s) => s.setImageOpacity);
  const select = useStore((s) => s.select);
  const setImage = useStore((s) => s.setImage);
  const rooms = objects.filter((o) => o.kind === 'room');
  const orphans = objects.filter((o) => o.kind === 'item' && !o.roomId);

  return (
    <div className="panel-body">
      <section>
        <h2>Build your house</h2>
        <ol className="steps">
          <li>
            Pick <b>Room</b>, choose a shape and drag over the plan. Edges snap together; rooms can’t overlap.
          </li>
          <li>
            Switch to <b>Item</b> and draw fixtures (toilet, shower, stovetop) inside rooms.
          </li>
          <li>Select anything to name it and set how many days between cleans.</li>
          <li>
            Switch to <b>Track</b> and tap things as you clean them.
          </li>
        </ol>
        <p className="hint">Hold Shift for squares/circles. Scroll or pinch to zoom, drag empty space to pan.</p>
      </section>

      {image && (
        <section>
          <h3>Floor plan</h3>
          <label className="field">
            <span>Plan visibility</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={imageOpacity}
              onChange={(e) => setImageOpacity(Number(e.target.value))}
            />
          </label>
          <button className="btn ghost small" onClick={() => confirm('Remove the floor plan image?') && setImage(null)}>
            Remove image
          </button>
        </section>
      )}

      <section>
        <h3>
          Rooms <span className="count">{rooms.length}</span>
        </h3>
        {rooms.length === 0 && <p className="hint">No rooms yet.</p>}
        <ul className="tree">
          {rooms.map((r) => (
            <li key={r.id}>
              <button className="tree-row" onClick={() => select(r.id)}>
                <span className="name">{r.name || 'Untitled room'}</span>
                <span className="meta">{everyText(r.intervalDays)}</span>
              </button>
              <ul>
                {objects
                  .filter((i) => i.kind === 'item' && i.roomId === r.id)
                  .map((i) => (
                    <li key={i.id}>
                      <button className="tree-row item" onClick={() => select(i.id)}>
                        <span className="name">{i.name || 'Untitled item'}</span>
                        <span className="meta">{everyText(i.intervalDays)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
        {orphans.length > 0 && (
          <p className="warn">
            {orphans.length} item{orphans.length > 1 ? 's are' : ' is'} outside every room:{' '}
            {orphans.map((o, i) => (
              <button key={o.id} className="link" onClick={() => select(o.id)}>
                {o.name}
                {i < orphans.length - 1 ? ', ' : ''}
              </button>
            ))}
          </p>
        )}
      </section>
    </div>
  );
}

function ObjectEditor({ o, now }: { o: CleanObj; now: number }) {
  const s = useStore.getState();
  const select = useStore((st) => st.select);
  const room = useStore((st) => (o.roomId ? st.objects.find((r) => r.id === o.roomId) : undefined));
  const childCount = useStore((st) => st.objects.filter((i) => i.kind === 'item' && i.roomId === o.id).length);
  const theme = useTheme().canvas;
  const t = staleness(o, now);

  const [daysText, setDaysText] = useState(String(o.intervalDays));
  const setDays = (n: number) => {
    setDaysText(String(n));
    if (!Number.isFinite(n) || n < 1) return;
    s.checkpoint();
    s.patchQuiet(o.id, { intervalDays: Math.round(n) });
  };
  const del = () => {
    if (childCount && !confirm(`Delete ${o.name} and the ${childCount} item${childCount > 1 ? 's' : ''} inside it?`)) return;
    s.deleteObject(o.id);
  };

  return (
    <div className="panel-body">
      <div className="editor-head">
        <button className="icon-btn" onClick={() => select(null)} title="Back to overview" aria-label="Back">
          <Icon name="close" size={16} />
        </button>
        <span className={`chip ${o.kind}`}>{o.kind === 'room' ? 'Room' : 'Item'}</span>
        <span className="meta">
          {SHAPE_NAME[o.shape]}
          {o.kind === 'item' && (room ? ` · in ${room.name}` : ' · not in a room')}
        </span>
      </div>

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={o.name}
          placeholder={o.kind === 'room' ? 'e.g. Kitchen' : 'e.g. Stovetop'}
          onFocus={() => s.checkpoint()}
          onChange={(e) => s.patchQuiet(o.id, { name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          autoFocus={o.name.startsWith('Room ') || o.name.startsWith('Item ')}
        />
      </label>

      <div className="field">
        <span>Clean every</span>
        <div className="interval">
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={daysText}
            onChange={(e) => {
              setDaysText(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(n) && n >= 1) {
                s.checkpoint();
                s.patchQuiet(o.id, { intervalDays: Math.round(n) });
              }
            }}
            onBlur={() => setDaysText(String(o.intervalDays))}
          />
          <span>days</span>
        </div>
        <div className="presets">
          {PRESETS.map((n) => (
            <button key={n} className={`chip-btn ${o.intervalDays === n ? 'on' : ''}`} onClick={() => setDays(n)}>
              {n === 1 ? 'Daily' : n === 7 ? 'Weekly' : n === 14 ? '2 wks' : n === 30 ? 'Monthly' : n === 90 ? '3 mo' : `${n}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Type</span>
        <div className="segmented small">
          <button className={o.kind === 'room' ? 'on' : ''} onClick={() => o.kind !== 'room' && s.tryPatch(o.id, { kind: 'room' })}>
            Room
          </button>
          <button className={o.kind === 'item' ? 'on' : ''} onClick={() => o.kind !== 'item' && s.tryPatch(o.id, { kind: 'item' })}>
            Item
          </button>
        </div>
      </div>

      {o.shape === 'triangle' && (
        <div className="field">
          <span>Triangle</span>
          <div className="row">
            <button className="btn small" onClick={() => s.tryPatch(o.id, { orient: (o.orient + 1) % 4 })}>
              <Icon name="rotate" size={15} /> Rotate
            </button>
            <div className="segmented small">
              <button className={o.right ? 'on' : ''} onClick={() => !o.right && s.tryPatch(o.id, { right: true })}>
                Right-angle
              </button>
              <button className={!o.right ? 'on' : ''} onClick={() => o.right && s.tryPatch(o.id, { right: false })}>
                Isosceles
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="field">
        <span>Starting state</span>
        <div className="status-line">
          <span className="swatch" style={{ background: stalenessColor(t, theme) }} />
          {lastCleanedText(o, now)}
        </div>
        <div className="row">
          <button className="btn small" onClick={() => s.setLastCleaned(o.id, Date.now())}>
            Cleaned today
          </button>
          <button
            className="btn small ghost"
            disabled={o.lastCleaned === null}
            onClick={() => s.setLastCleaned(o.id, null)}
          >
            Never cleaned
          </button>
        </div>
      </div>

      <div className="editor-foot">
        <button className="btn danger" onClick={del}>
          <Icon name="trash" size={15} /> Delete {o.kind}
        </button>
      </div>
    </div>
  );
}
