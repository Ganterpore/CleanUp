import Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ellipse, Image as KImage, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva';
import { shortStatus, staleness, stalenessColor } from '../freshness';
import {
  boxShape,
  findLabelSpot,
  isPlacementValid,
  MIN_SIZE,
  polygonOf,
  snapEdge,
  snapPoint,
  snapTargets,
  snapTranslate,
  unionBBox,
  type Geo,
  type Guides,
  type Pt,
} from '../geometry';
import { defaultName, newId, useStore } from '../store';
import type { CleanObj, ShapeKind } from '../types';

const SNAP_PX = 12;
const TAP_PX = 6;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

interface View {
  x: number;
  y: number;
  scale: number;
}

interface Draft {
  objs: Record<string, CleanObj>;
  invalid: boolean;
  guides: Guides;
}

type Interaction =
  | { type: 'pan'; start: Pt; view0: View; tapId: string | null; moved: boolean }
  | {
      type: 'move';
      start: Pt;
      startW: Pt;
      orig: CleanObj;
      children: CleanObj[];
      moved: boolean;
      last: Record<string, CleanObj> | null;
    }
  | { type: 'resize'; handle: Handle; orig: CleanObj; last: CleanObj | null }
  | { type: 'draw'; startW: Pt; last: CleanObj | null; current: CleanObj | null }
  | { type: 'pinch'; d0: number; mid0: Pt; view0: View };

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of a single line of label text at the given font size. */
function measureText(text: string, px: number, weight: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * px * 0.6;
  measureCtx.font = `${weight} ${px}px Inter, system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
}

const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

function useHtmlImage(src: string | undefined) {
  const [loaded, setLoaded] = useState<{ src: string; el: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!src) return;
    const el = new window.Image();
    el.onload = () => setLoaded({ src, el });
    el.src = src;
  }, [src]);
  // Only hand back an element that matches the current src, never a stale one.
  return loaded && loaded.src === src ? loaded.el : null;
}

function handlePos(o: CleanObj, h: Handle): Pt {
  const x = h.includes('w') ? o.x : h.includes('e') ? o.x + o.w : o.x + o.w / 2;
  const y = h.includes('n') ? o.y : h.includes('s') ? o.y + o.h : o.y + o.h / 2;
  return { x, y };
}

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

export function FloorCanvas({ now }: { now: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<View>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  const setView = (v: View) => {
    viewRef.current = v;
    setViewState(v);
  };
  const [draft, setDraftState] = useState<Draft | null>(null);
  const inter = useRef<Interaction | null>(null);
  const pointers = useRef(new Map<number, Pt>());

  const objects = useStore((s) => s.objects);
  const mode = useStore((s) => s.mode);
  const tool = useStore((s) => s.tool);
  const selectedId = useStore((s) => s.selectedId);
  const image = useStore((s) => s.image);
  const imageOpacity = useStore((s) => s.imageOpacity);
  const fitNonce = useStore((s) => s.fitNonce);
  const img = useHtmlImage(image?.src);

  // ----- sizing & fit -----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const { objects, image } = useStore.getState();
    const el = containerRef.current;
    if (!el || !el.clientWidth) return;
    const boxes = [...objects];
    if (image) boxes.push({ x: 0, y: 0, w: image.width, h: image.height } as CleanObj);
    const b = unionBBox(boxes) ?? { x: 0, y: 0, w: 1600, h: 1000 };
    const pad = 32;
    const scale = Math.min((el.clientWidth - pad * 2) / b.w, (el.clientHeight - pad * 2) / b.h);
    setView({
      scale,
      x: el.clientWidth / 2 - (b.x + b.w / 2) * scale,
      y: el.clientHeight / 2 - (b.y + b.h / 2) * scale,
    });
  }, []);

  const hasSize = size.w > 0;
  useEffect(() => {
    if (hasSize) fit();
  }, [fitNonce, hasSize, fit, image?.width, image?.height]);

  // ----- helpers -----
  const toWorld = (p: Pt): Pt => {
    const v = viewRef.current;
    return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
  };
  const screenPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitAt = (p: Pt): { objId?: string; handle?: Handle } => {
    const shape = stageRef.current?.getIntersection(p);
    const name = shape?.name() ?? '';
    if (name.startsWith('obj:')) return { objId: name.slice(4) };
    if (name.startsWith('handle:')) return { handle: name.slice(7) as Handle };
    return {};
  };
  const setDraft = (d: Draft | null) => setDraftState(d);
  const thr = () => SNAP_PX / viewRef.current.scale;

  const zoomAt = (p: Pt, factor: number) => {
    const v = viewRef.current;
    const scale = Math.min(40, Math.max(0.02, v.scale * factor));
    const k = scale / v.scale;
    setView({ scale, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const speed = e.ctrlKey ? 0.01 : 0.0015;
      zoomAt({ x: e.clientX - r.left, y: e.clientY - r.top }, Math.exp(-e.deltaY * speed));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ----- interaction computations -----
  const computeMove = (it: Extract<Interaction, { type: 'move' }>, w: Pt) => {
    const all = useStore.getState().objects;
    const o = it.orig;
    const c: CleanObj = { ...o, x: o.x + w.x - it.startW.x, y: o.y + w.y - it.startW.y };
    const s = snapTranslate(c, snapTargets(o, all), thr());
    c.x += s.dx;
    c.y += s.dy;
    const objs: Record<string, CleanObj> = { [o.id]: c };
    for (const ch of it.children) objs[ch.id] = { ...ch, x: ch.x + c.x - o.x, y: ch.y + c.y - o.y };
    const valid = isPlacementValid(c, all);
    if (valid) it.last = objs;
    setDraft({ objs, invalid: !valid, guides: s.guides });
  };

  const computeResize = (it: Extract<Interaction, { type: 'resize' }>, w: Pt, square: boolean) => {
    const all = useStore.getState().objects;
    const o = it.orig;
    const others = snapTargets(o, all);
    let l = o.x;
    let r = o.x + o.w;
    let t = o.y;
    let b = o.y + o.h;
    const h = it.handle;
    if (h.includes('w')) l = Math.min(w.x, r - MIN_SIZE);
    if (h.includes('e')) r = Math.max(w.x, l + MIN_SIZE);
    if (h.includes('n')) t = Math.min(w.y, b - MIN_SIZE);
    if (h.includes('s')) b = Math.max(w.y, t + MIN_SIZE);
    if (square && h.length === 2) {
      const side = Math.max(r - l, b - t);
      if (h.includes('w')) l = r - side;
      else r = l + side;
      if (h.includes('n')) t = b - side;
      else b = t + side;
    }
    const guides: Guides = { x: null, y: null };
    const box = { x: l, y: t, w: r - l, h: b - t };
    const t_ = thr();
    if (h.includes('w') || h.includes('e')) {
      const edge = h.includes('w') ? l : r;
      const s = snapEdge(edge, 'x', box, others, t_);
      if (s) {
        if (h.includes('w')) l = Math.min(s.at, r - MIN_SIZE);
        else r = Math.max(s.at, l + MIN_SIZE);
        guides.x = s.at;
      }
    }
    if (h.includes('n') || h.includes('s')) {
      const edge = h.includes('n') ? t : b;
      const s = snapEdge(edge, 'y', box, others, t_);
      if (s) {
        if (h.includes('n')) t = Math.min(s.at, b - MIN_SIZE);
        else b = Math.max(s.at, t + MIN_SIZE);
        guides.y = s.at;
      }
    }
    const c: CleanObj = { ...o, x: l, y: t, w: r - l, h: b - t };
    const valid = isPlacementValid(c, all);
    if (valid) it.last = c;
    setDraft({ objs: { [o.id]: c }, invalid: !valid, guides });
  };

  const computeDraw = (it: Extract<Interaction, { type: 'draw' }>, w: Pt, square: boolean) => {
    const st = useStore.getState();
    const all = st.objects;
    const kind = st.drawKind;
    const shape = st.tool as ShapeKind;
    const p1 = snapPoint(w, snapTargets({ id: '', kind }, all), thr());
    const p0 = it.startW;
    let wd = Math.abs(p1.x - p0.x);
    let ht = Math.abs(p1.y - p0.y);
    if (square) wd = ht = Math.max(wd, ht);
    const x = p1.x < p0.x ? p0.x - wd : p0.x;
    const y = p1.y < p0.y ? p0.y - ht : p0.y;
    const c: CleanObj = it.current
      ? { ...it.current, x, y, w: wd, h: ht }
      : {
          id: newId(),
          kind,
          shape,
          x,
          y,
          w: wd,
          h: ht,
          orient: 0,
          right: true,
          name: defaultName(kind, all),
          intervalDays: 7,
          lastCleaned: null,
          history: [],
          roomId: null,
          editedAt: Date.now(),
          cleanEditedAt: 0,
        };
    it.current = c;
    const big = wd >= MIN_SIZE && ht >= MIN_SIZE;
    const valid = big && isPlacementValid(c, all);
    it.last = valid ? c : null;
    setDraft({ objs: { [c.id]: c }, invalid: big && !valid, guides: p1.guides });
  };

  const cancelInteraction = () => {
    inter.current = null;
    setDraft(null);
  };

  // ----- pointer events -----
  const onPointerDown = (e: React.PointerEvent) => {
    const p = screenPt(e);
    pointers.current.set(e.pointerId, p);
    containerRef.current?.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      cancelInteraction();
      const [a, b] = [...pointers.current.values()];
      inter.current = {
        type: 'pinch',
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view0: viewRef.current,
      };
      return;
    }
    if (pointers.current.size > 2) return;

    const st = useStore.getState();
    const hit = hitAt(p);
    const pan = (tapId: string | null = null) => {
      inter.current = { type: 'pan', start: p, view0: viewRef.current, tapId, moved: false };
    };
    if (e.pointerType === 'mouse' && e.button !== 0) return pan();
    if (st.mode === 'track') return pan(hit.objId ?? null);

    if (st.tool !== 'select') {
      const w = toWorld(p);
      const s = snapPoint(w, snapTargets({ id: '', kind: st.drawKind }, st.objects), thr());
      inter.current = { type: 'draw', startW: { x: s.x, y: s.y }, last: null, current: null };
      return;
    }
    if (hit.handle && st.selectedId) {
      const orig = st.objects.find((o) => o.id === st.selectedId);
      if (orig) {
        inter.current = { type: 'resize', handle: hit.handle, orig, last: null };
        return;
      }
    }
    if (hit.objId) {
      const orig = st.objects.find((o) => o.id === hit.objId);
      if (orig) {
        st.select(orig.id);
        inter.current = {
          type: 'move',
          start: p,
          startW: toWorld(p),
          orig,
          children: orig.kind === 'room' ? st.objects.filter((o) => o.kind === 'item' && o.roomId === orig.id) : [],
          moved: false,
          last: null,
        };
        return;
      }
    }
    st.select(null);
    pan();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = screenPt(e);
    const it = inter.current;
    if (!pointers.current.has(e.pointerId)) {
      // hover: update cursor
      if (e.pointerType === 'mouse' && containerRef.current) {
        const st = useStore.getState();
        let cursor = 'grab';
        if (st.mode === 'setup' && st.tool !== 'select') cursor = 'crosshair';
        else {
          const hit = hitAt(p);
          if (hit.handle) cursor = HANDLE_CURSOR[hit.handle];
          else if (hit.objId) cursor = st.mode === 'track' ? 'pointer' : 'move';
        }
        containerRef.current.style.cursor = cursor;
      }
      return;
    }
    pointers.current.set(e.pointerId, p);
    if (!it) return;

    if (it.type === 'pinch') {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const v0 = it.view0;
      const scale = Math.min(40, Math.max(0.02, v0.scale * (d / it.d0)));
      const wx = (it.mid0.x - v0.x) / v0.scale;
      const wy = (it.mid0.y - v0.y) / v0.scale;
      setView({ scale, x: mid.x - wx * scale, y: mid.y - wy * scale });
      return;
    }
    if (it.type === 'pan') {
      const dx = p.x - it.start.x;
      const dy = p.y - it.start.y;
      if (!it.moved && Math.hypot(dx, dy) < TAP_PX) return;
      it.moved = true;
      if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
      setView({ ...it.view0, x: it.view0.x + dx, y: it.view0.y + dy });
      return;
    }
    const w = toWorld(p);
    if (it.type === 'move') {
      if (!it.moved && Math.hypot(p.x - it.start.x, p.y - it.start.y) < 3) return;
      it.moved = true;
      computeMove(it, w);
    } else if (it.type === 'resize') {
      computeResize(it, w, e.shiftKey);
    } else if (it.type === 'draw') {
      computeDraw(it, w, e.shiftKey);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const it = inter.current;
    if (!it) return;
    if (it.type === 'pinch') {
      if (pointers.current.size < 2) inter.current = null;
      return;
    }
    inter.current = null;
    const st = useStore.getState();
    if (it.type === 'pan') {
      if (containerRef.current) containerRef.current.style.cursor = '';
      if (!it.moved && it.tapId && e.type !== 'pointercancel') st.markCleaned(it.tapId);
    } else if (it.type === 'move') {
      if (it.moved && it.last) {
        const last = it.last;
        st.commit(st.objects.map((o) => last[o.id] ?? o));
      }
    } else if (it.type === 'resize') {
      if (it.last) {
        const last = it.last;
        st.commit(st.objects.map((o) => (o.id === last.id ? last : o)));
      }
    } else if (it.type === 'draw') {
      const c = it.current;
      if (it.last) {
        st.addObject(it.last);
        st.setTool('select');
        st.select(it.last.id);
      } else if (c && c.w >= MIN_SIZE && c.h >= MIN_SIZE) {
        st.showToast(c.kind === 'room' ? 'Rooms can’t overlap other rooms.' : 'Draw items inside a room.');
      }
    }
    setDraft(null);
  };

  // ----- rendering -----
  const shown = useMemo(() => {
    const list = objects.map((o) => draft?.objs[o.id] ?? o);
    if (draft) for (const d of Object.values(draft.objs)) if (!objects.some((o) => o.id === d.id)) list.push(d);
    return list;
  }, [objects, draft]);
  const rooms = shown.filter((o) => o.kind === 'room');
  const items = shown.filter((o) => o.kind === 'item');
  const selected = mode === 'setup' ? shown.find((o) => o.id === selectedId) : undefined;
  const s = view.scale;
  const editing = mode === 'setup';

  const styleFor = (o: CleanObj) => {
    const isDraft = !!draft?.objs[o.id];
    const bad = isDraft && draft!.invalid;
    const isSel = o.id === selectedId && editing;
    if (editing) {
      const room = o.kind === 'room';
      return {
        fill: bad ? 'rgba(239,68,68,0.25)' : room ? 'rgba(59,130,246,0.18)' : 'rgba(245,158,11,0.45)',
        stroke: bad ? '#dc2626' : isSel ? '#1d4ed8' : room ? '#3b82f6' : '#b45309',
        strokeWidth: isSel ? 2.5 : room ? 1.5 : 1.25,
        dash: bad ? [6, 4] : undefined,
        text: room ? '#1e3a8a' : '#78350f',
      };
    }
    const t = staleness(o, now);
    return {
      fill: stalenessColor(t),
      stroke: o.kind === 'room' ? '#475569' : '#1e293b',
      strokeWidth: o.kind === 'room' ? 1.5 : 1.5,
      dash: undefined,
      text: t > 0.72 ? '#ffffff' : '#1e293b',
    };
  };

  const renderShape = (o: CleanObj) => {
    const st = styleFor(o);
    const common = {
      name: `obj:${o.id}`,
      fill: st.fill,
      stroke: st.stroke,
      strokeWidth: st.strokeWidth,
      dash: st.dash,
      strokeScaleEnabled: false,
      perfectDrawEnabled: false,
    };
    if (o.shape === 'rect') return <Rect key={o.id} x={o.x} y={o.y} width={o.w} height={o.h} {...common} />;
    if (o.shape === 'ellipse')
      return <Ellipse key={o.id} x={o.x + o.w / 2} y={o.y + o.h / 2} radiusX={o.w / 2} radiusY={o.h / 2} {...common} />;
    return <Line key={o.id} points={polygonOf(o).flatMap((p) => [p.x, p.y])} closed {...common} />;
  };

  /**
   * Lay out every label so text is never chopped and labels never overlap.
   * Each label tries, in order: full text → smaller font → name only (track mode).
   * Items are placed first (centred in themselves). A room label then looks for a
   * spot clear of every item, and failing that, a spot clear of the item labels.
   * If nothing fits, the label is hidden; the colour still shows the status.
   */
  const labelLayouts = useMemo(() => {
    type Layout = { x: number; y: number; w: number; h: number; text: string; px: number; pad: number };
    const layouts = new Map<string, Layout>();
    const pad = 3 / s;
    const options = (o: CleanObj) => {
      const base = o.kind === 'room' ? 13 : 11;
      const weight = o.kind === 'room' ? '600' : '500';
      const texts = editing ? [o.name] : [`${o.name}\n${shortStatus(o, now)}`, o.name];
      return texts.flatMap((text) =>
        [base, base - 2].map((px) => {
          const lines = text.split('\n');
          // Measure at the size the canvas actually draws (glyph widths don't scale linearly), plus slack.
          const w = Math.max(...lines.map((l) => measureText(l, px / s, weight))) + pad * 2 + 2 / s;
          const h = (lines.length * px * 1.25) / s + pad * 2;
          return { text, px, w, h };
        }),
      );
    };
    const place = (o: CleanObj, obstacles: Geo[]) => {
      for (const opt of options(o)) {
        const spot = findLabelSpot(o, obstacles, opt.w, opt.h, 3 / s);
        if (spot) return { ...spot, ...opt, pad };
      }
      return null;
    };

    const items = shown.filter((o) => o.kind === 'item');
    for (const i of items) {
      const l = place(i, []);
      if (l) layouts.set(i.id, l);
    }
    const itemLabelBoxes = [...layouts.values()].map((l) => boxShape(l));
    for (const r of shown) {
      if (r.kind !== 'room') continue;
      const l = place(r, items) ?? place(r, itemLabelBoxes);
      if (l) layouts.set(r.id, l);
    }
    return layouts;
  }, [shown, s, editing, now]);

  const renderLabel = (o: CleanObj) => {
    const l = labelLayouts.get(o.id);
    if (!l) return null;
    return (
      // No fixed width/height: Konva trims lines that overflow a fixed box, so let it size itself.
      <Text
        key={`t-${o.id}`}
        x={l.x}
        y={l.y}
        text={l.text}
        align="center"
        fontSize={l.px / s}
        lineHeight={1.25}
        fontStyle={o.kind === 'room' ? '600' : '500'}
        fontFamily="Inter, system-ui, sans-serif"
        fill={styleFor(o).text}
        padding={l.pad}
        listening={false}
      />
    );
  };

  const hs = (coarsePointer ? 18 : 10) / s;
  const bigExtent = 1e6;

  return (
    <div
      ref={containerRef}
      className="canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {hasSize && (
        <Stage ref={stageRef} width={size.w} height={size.h} x={view.x} y={view.y} scaleX={s} scaleY={s}>
          <Layer listening={false}>
            {!image && (
              <Shape
                sceneFunc={(ctx) => {
                  const step = s < 0.25 ? 200 : 50;
                  const x0 = Math.floor(-view.x / s / step) * step;
                  const y0 = Math.floor(-view.y / s / step) * step;
                  const x1 = (size.w - view.x) / s;
                  const y1 = (size.h - view.y) / s;
                  ctx.beginPath();
                  for (let x = x0; x <= x1; x += step) {
                    ctx.moveTo(x, y0);
                    ctx.lineTo(x, y1);
                  }
                  for (let y = y0; y <= y1; y += step) {
                    ctx.moveTo(x0, y);
                    ctx.lineTo(x1, y);
                  }
                  ctx.strokeStyle = '#e2e8f0';
                  ctx.lineWidth = 1 / s;
                  ctx.stroke();
                }}
              />
            )}
          </Layer>
          <Layer>
            {rooms.map(renderShape)}
            {img && image && (
              <KImage
                image={img}
                x={0}
                y={0}
                width={image.width}
                height={image.height}
                opacity={imageOpacity}
                globalCompositeOperation="multiply"
                listening={false}
              />
            )}
            {items.map(renderShape)}
            {rooms.map(renderLabel)}
            {items.map(renderLabel)}
          </Layer>
          <Layer>
            {draft?.guides.x != null && (
              <Line
                points={[draft.guides.x, -bigExtent, draft.guides.x, bigExtent]}
                stroke="#d946ef"
                strokeWidth={1}
                dash={[4, 4]}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
            {draft?.guides.y != null && (
              <Line
                points={[-bigExtent, draft.guides.y, bigExtent, draft.guides.y]}
                stroke="#d946ef"
                strokeWidth={1}
                dash={[4, 4]}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
            {selected && tool === 'select' && (
              <>
                <Rect
                  x={selected.x}
                  y={selected.y}
                  width={selected.w}
                  height={selected.h}
                  stroke="#1d4ed8"
                  strokeWidth={1}
                  dash={[3, 3]}
                  strokeScaleEnabled={false}
                  listening={false}
                />
                {HANDLES.map((h) => {
                  const p = handlePos(selected, h);
                  return (
                    <Rect
                      key={h}
                      name={`handle:${h}`}
                      x={p.x - hs / 2}
                      y={p.y - hs / 2}
                      width={hs}
                      height={hs}
                      cornerRadius={2 / s}
                      fill="#ffffff"
                      stroke="#1d4ed8"
                      strokeWidth={1.5}
                      strokeScaleEnabled={false}
                    />
                  );
                })}
              </>
            )}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
