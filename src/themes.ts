/**
 * Colour themes. Each theme drives both the HTML UI (as CSS custom properties on
 * <html>) and the Konva floor plan (read directly by FloorCanvas), so a theme is
 * the single place every colour in the app comes from.
 */

export type ThemeId = 'classic' | 'midnight' | 'blueprint' | 'terminal' | 'paper' | 'candy';

export interface CanvasTheme {
  bg: string;
  grid: string;
  font: string;
  /** Draw plan labels in capitals (drafting-style lettering). */
  upper?: boolean;
  /** Freshness ramp: held at `fresh` until halfway to due, then → `due` → `overdue`. Hex only. */
  fresh: string;
  due: string;
  overdue: string;
  /** Track-mode outlines. */
  roomStroke: string;
  itemStroke: string;
  /** Label colours, picked by the brightness of whatever they sit on. */
  textOnLight: string;
  textOnDark: string;
  /** Setup-mode styling. */
  roomFill: string;
  roomEdge: string;
  roomText: string;
  itemFill: string;
  itemEdge: string;
  itemText: string;
  badFill: string;
  badEdge: string;
  selected: string;
  guide: string;
  handleFill: string;
  /**
   * How the floor plan image sits on the shapes. Light themes multiply a dark-on-white
   * plan; dark themes invert it (optionally tinting the lines) and screen it on.
   */
  image: { invert: boolean; tint?: string };
}

export interface Theme {
  id: ThemeId;
  name: string;
  dark: boolean;
  /** Two colours for the picker swatch. */
  swatch: [string, string];
  css: Record<string, string>;
  canvas: CanvasTheme;
}

const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, ui-serif, serif";

const classic: Theme = {
  id: 'classic',
  name: 'Classic',
  dark: false,
  swatch: ['#ffffff', '#2563eb'],
  css: {
    font: SANS,
    bg: '#f8fafc',
    surface: '#ffffff',
    'surface-2': '#f8fafc',
    hover: '#f1f5f9',
    ink: '#0f172a',
    'ink-hover': '#1e293b',
    'on-ink': '#ffffff',
    'ink-2': '#475569',
    'ink-3': '#94a3b8',
    line: '#e2e8f0',
    'line-strong': '#cbd5e1',
    accent: '#2563eb',
    'accent-soft': '#dbeafe',
    'room-chip': '#1d4ed8',
    'item-chip-bg': '#fef3c7',
    'item-chip': '#92400e',
    danger: '#dc2626',
    'danger-soft': '#fef2f2',
    'danger-line': '#fecaca',
    ok: '#15803d',
    'ok-soft': '#f0fdf4',
    'ok-line': '#bbf7d0',
    'warn-fg': '#b45309',
    'warn-bg': '#fffbeb',
    'swatch-line': 'rgba(15, 23, 42, 0.25)',
    'hint-bg': 'rgba(15, 23, 42, 0.82)',
    'hint-fg': '#ffffff',
    backdrop: 'rgba(15, 23, 42, 0.35)',
    glow: '#fee2e2',
    shadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 16px rgba(15, 23, 42, 0.08)',
    'canvas-bg': '#ffffff',
  },
  canvas: {
    bg: '#ffffff',
    grid: '#e2e8f0',
    font: 'Inter, system-ui, sans-serif',
    fresh: '#ffffff',
    due: '#f97316',
    overdue: '#dc2626',
    roomStroke: '#475569',
    itemStroke: '#1e293b',
    textOnLight: '#1e293b',
    textOnDark: '#ffffff',
    roomFill: 'rgba(59,130,246,0.18)',
    roomEdge: '#3b82f6',
    roomText: '#1e3a8a',
    itemFill: 'rgba(245,158,11,0.45)',
    itemEdge: '#b45309',
    itemText: '#78350f',
    badFill: 'rgba(239,68,68,0.25)',
    badEdge: '#dc2626',
    selected: '#1d4ed8',
    guide: '#d946ef',
    handleFill: '#ffffff',
    image: { invert: false },
  },
};

const midnight: Theme = {
  id: 'midnight',
  name: 'Midnight',
  dark: true,
  swatch: ['#0b1120', '#60a5fa'],
  css: {
    ...classic.css,
    bg: '#0b1120',
    surface: '#111827',
    'surface-2': '#162032',
    hover: '#1f2937',
    ink: '#e5e7eb',
    'ink-hover': '#f9fafb',
    'on-ink': '#0b1120',
    'ink-2': '#9ca3af',
    'ink-3': '#6b7280',
    line: '#1f2937',
    'line-strong': '#374151',
    accent: '#60a5fa',
    'accent-soft': 'rgba(96, 165, 250, 0.18)',
    'room-chip': '#93c5fd',
    'item-chip-bg': 'rgba(251, 191, 36, 0.16)',
    'item-chip': '#fcd34d',
    danger: '#f87171',
    'danger-soft': 'rgba(248, 113, 113, 0.12)',
    'danger-line': 'rgba(248, 113, 113, 0.35)',
    ok: '#4ade80',
    'ok-soft': 'rgba(74, 222, 128, 0.1)',
    'ok-line': 'rgba(74, 222, 128, 0.35)',
    'warn-fg': '#fcd34d',
    'warn-bg': 'rgba(251, 191, 36, 0.1)',
    'swatch-line': 'rgba(255, 255, 255, 0.2)',
    'hint-bg': 'rgba(229, 231, 235, 0.92)',
    'hint-fg': '#0b1120',
    backdrop: 'rgba(0, 0, 0, 0.55)',
    glow: 'rgba(96, 165, 250, 0.16)',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.4), 0 6px 20px rgba(0, 0, 0, 0.45)',
    'canvas-bg': '#0f172a',
  },
  canvas: {
    ...classic.canvas,
    bg: '#0f172a',
    grid: '#1e293b',
    fresh: '#1e293b',
    due: '#f97316',
    overdue: '#ef4444',
    roomStroke: '#64748b',
    itemStroke: '#94a3b8',
    textOnLight: '#0f172a',
    textOnDark: '#e2e8f0',
    roomFill: 'rgba(96,165,250,0.16)',
    roomEdge: '#60a5fa',
    roomText: '#bfdbfe',
    itemFill: 'rgba(251,191,36,0.28)',
    itemEdge: '#f59e0b',
    itemText: '#fde68a',
    badFill: 'rgba(248,113,113,0.25)',
    badEdge: '#f87171',
    selected: '#93c5fd',
    guide: '#e879f9',
    handleFill: '#0f172a',
    image: { invert: true },
  },
};

const blueprint: Theme = {
  id: 'blueprint',
  name: 'Blueprint',
  dark: true,
  swatch: ['#0f3d7a', '#ffffff'],
  css: {
    ...midnight.css,
    font: MONO,
    bg: '#0c3367',
    surface: '#0f3d7a',
    'surface-2': '#134689',
    hover: '#16509a',
    ink: '#f0f6ff',
    'ink-hover': '#ffffff',
    'on-ink': '#0f3d7a',
    'ink-2': '#b6cdee',
    'ink-3': '#7d9fd0',
    line: 'rgba(214, 230, 255, 0.22)',
    'line-strong': 'rgba(214, 230, 255, 0.45)',
    accent: '#ffd666',
    'accent-soft': 'rgba(255, 214, 102, 0.2)',
    'room-chip': '#ffffff',
    'item-chip-bg': 'rgba(255, 214, 102, 0.18)',
    'item-chip': '#ffe49a',
    danger: '#ff8a8a',
    'warn-fg': '#ffe49a',
    'warn-bg': 'rgba(255, 214, 102, 0.12)',
    'swatch-line': 'rgba(255, 255, 255, 0.5)',
    'hint-bg': 'rgba(240, 246, 255, 0.92)',
    'hint-fg': '#0c3367',
    backdrop: 'rgba(4, 20, 45, 0.6)',
    glow: 'rgba(255, 255, 255, 0.1)',
    'canvas-bg': '#1554a5',
  },
  canvas: {
    ...midnight.canvas,
    bg: '#1554a5',
    grid: 'rgba(255,255,255,0.16)',
    font: MONO,
    upper: true,
    fresh: '#1554a5',
    due: '#ffc94d',
    overdue: '#ff5c7a',
    roomStroke: 'rgba(255,255,255,0.9)',
    itemStroke: 'rgba(255,255,255,0.75)',
    textOnLight: '#0c3367',
    textOnDark: '#ffffff',
    roomFill: 'rgba(255,255,255,0.08)',
    roomEdge: '#ffffff',
    roomText: '#ffffff',
    itemFill: 'rgba(255,214,102,0.22)',
    itemEdge: '#ffd666',
    itemText: '#fff3c4',
    badFill: 'rgba(255,92,122,0.3)',
    badEdge: '#ff5c7a',
    selected: '#ffd666',
    guide: '#7df9ff',
    handleFill: '#1554a5',
    image: { invert: true },
  },
};

const terminal: Theme = {
  id: 'terminal',
  name: 'Terminal',
  dark: true,
  swatch: ['#050a05', '#39ff6a'],
  css: {
    ...midnight.css,
    font: MONO,
    bg: '#030703',
    surface: '#071007',
    'surface-2': '#0b180b',
    hover: '#0f220f',
    ink: '#39ff6a',
    'ink-hover': '#8dffa9',
    'on-ink': '#030703',
    'ink-2': '#27c24f',
    'ink-3': '#1a7a33',
    line: '#123a1a',
    'line-strong': '#1d5a29',
    accent: '#39ff6a',
    'accent-soft': 'rgba(57, 255, 106, 0.15)',
    'room-chip': '#39ff6a',
    'item-chip-bg': 'rgba(255, 191, 0, 0.14)',
    'item-chip': '#ffbf00',
    danger: '#ff4d6d',
    'danger-soft': 'rgba(255, 77, 109, 0.12)',
    'danger-line': 'rgba(255, 77, 109, 0.4)',
    ok: '#39ff6a',
    'ok-soft': 'rgba(57, 255, 106, 0.1)',
    'ok-line': 'rgba(57, 255, 106, 0.4)',
    'warn-fg': '#ffbf00',
    'warn-bg': 'rgba(255, 191, 0, 0.1)',
    'swatch-line': 'rgba(57, 255, 106, 0.4)',
    'hint-bg': 'rgba(57, 255, 106, 0.9)',
    'hint-fg': '#030703',
    glow: 'rgba(57, 255, 106, 0.12)',
    shadow: '0 0 0 1px rgba(57, 255, 106, 0.08), 0 0 18px rgba(57, 255, 106, 0.12)',
    'canvas-bg': '#030703',
  },
  canvas: {
    ...midnight.canvas,
    bg: '#030703',
    grid: '#0d240f',
    font: MONO,
    fresh: '#071407',
    due: '#c79500',
    overdue: '#ff2e55',
    roomStroke: '#27c24f',
    itemStroke: '#39ff6a',
    textOnLight: '#030703',
    textOnDark: '#39ff6a',
    roomFill: 'rgba(57,255,106,0.08)',
    roomEdge: '#39ff6a',
    roomText: '#8dffa9',
    itemFill: 'rgba(255,191,0,0.2)',
    itemEdge: '#ffbf00',
    itemText: '#ffd966',
    badFill: 'rgba(255,46,85,0.25)',
    badEdge: '#ff2e55',
    selected: '#8dffa9',
    guide: '#00e5ff',
    handleFill: '#030703',
    image: { invert: true, tint: '#39ff6a' },
  },
};

const paper: Theme = {
  id: 'paper',
  name: 'Paper',
  dark: false,
  swatch: ['#f4ecd8', '#b5532a'],
  css: {
    ...classic.css,
    font: SERIF,
    bg: '#efe6d0',
    surface: '#fbf6ea',
    'surface-2': '#f6efdd',
    hover: '#efe5cc',
    ink: '#3b2f22',
    'ink-hover': '#52412f',
    'on-ink': '#fbf6ea',
    'ink-2': '#6e5a43',
    'ink-3': '#a48e72',
    line: '#e2d5b8',
    'line-strong': '#cdb994',
    accent: '#b5532a',
    'accent-soft': '#f3dccb',
    'room-chip': '#8f3d1b',
    'item-chip-bg': '#e9e2c0',
    'item-chip': '#5c5a1f',
    danger: '#b3261e',
    'danger-soft': '#f7e3dc',
    'danger-line': '#e8b9ab',
    ok: '#4d7c2a',
    'ok-soft': '#eef2df',
    'ok-line': '#cbd9a8',
    'warn-fg': '#8a5a12',
    'warn-bg': '#f6e9c8',
    'swatch-line': 'rgba(59, 47, 34, 0.3)',
    'hint-bg': 'rgba(59, 47, 34, 0.88)',
    'hint-fg': '#fbf6ea',
    backdrop: 'rgba(59, 47, 34, 0.35)',
    glow: '#f3dccb',
    shadow: '0 1px 2px rgba(59, 47, 34, 0.08), 0 4px 16px rgba(59, 47, 34, 0.1)',
    'canvas-bg': '#fbf6ea',
  },
  canvas: {
    ...classic.canvas,
    bg: '#fbf6ea',
    grid: '#ece1c6',
    font: SERIF,
    fresh: '#fbf6ea',
    due: '#e0a458',
    overdue: '#a83a22',
    roomStroke: '#6e5a43',
    itemStroke: '#3b2f22',
    textOnLight: '#3b2f22',
    textOnDark: '#fbf6ea',
    roomFill: 'rgba(181,83,42,0.12)',
    roomEdge: '#b5532a',
    roomText: '#6b2d12',
    itemFill: 'rgba(120,118,40,0.25)',
    itemEdge: '#6f6b22',
    itemText: '#3f3d10',
    badFill: 'rgba(179,38,30,0.2)',
    badEdge: '#b3261e',
    selected: '#8f3d1b',
    guide: '#2a7f8f',
    handleFill: '#fbf6ea',
    image: { invert: false },
  },
};

const candy: Theme = {
  id: 'candy',
  name: 'Candy',
  dark: false,
  swatch: ['#ffe3f1', '#8b5cf6'],
  css: {
    ...classic.css,
    bg: '#fdf2fa',
    surface: '#ffffff',
    'surface-2': '#fff5fb',
    hover: '#fce7f3',
    ink: '#4a1d5e',
    'ink-hover': '#5f2a76',
    'on-ink': '#ffffff',
    'ink-2': '#7c4a91',
    'ink-3': '#b892c9',
    line: '#f5d0e6',
    'line-strong': '#eab0d3',
    accent: '#8b5cf6',
    'accent-soft': '#ede4ff',
    'room-chip': '#6d28d9',
    'item-chip-bg': '#d5f7ea',
    'item-chip': '#0f766e',
    danger: '#e11d74',
    'danger-soft': '#fdeef5',
    'danger-line': '#f9c2db',
    ok: '#0f9f7a',
    'ok-soft': '#e6faf3',
    'ok-line': '#a7ecd5',
    'warn-fg': '#b45309',
    'warn-bg': '#fff6d6',
    'swatch-line': 'rgba(74, 29, 94, 0.25)',
    'hint-bg': 'rgba(74, 29, 94, 0.85)',
    backdrop: 'rgba(74, 29, 94, 0.3)',
    glow: '#e9d5ff',
    shadow: '0 1px 2px rgba(74, 29, 94, 0.06), 0 6px 20px rgba(219, 39, 119, 0.12)',
    'canvas-bg': '#fffafd',
  },
  canvas: {
    ...classic.canvas,
    bg: '#fffafd',
    grid: '#fbe3f1',
    fresh: '#dffbef',
    due: '#ffe066',
    overdue: '#ff3d8b',
    roomStroke: '#b892c9',
    itemStroke: '#7c4a91',
    textOnLight: '#4a1d5e',
    textOnDark: '#ffffff',
    roomFill: 'rgba(139,92,246,0.14)',
    roomEdge: '#8b5cf6',
    roomText: '#4c1d95',
    itemFill: 'rgba(45,212,191,0.3)',
    itemEdge: '#0d9488',
    itemText: '#134e4a',
    badFill: 'rgba(225,29,116,0.2)',
    badEdge: '#e11d74',
    selected: '#6d28d9',
    guide: '#f97316',
    handleFill: '#ffffff',
    image: { invert: false },
  },
};

export const THEMES: Theme[] = [classic, midnight, blueprint, terminal, paper, candy];
export const DEFAULT_THEME: ThemeId = 'classic';

export function getTheme(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? classic;
}

/** Push a theme's UI colours onto <html> and the browser chrome. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.css)) root.style.setProperty(`--${k}`, v);
  root.style.setProperty('--fresh', theme.canvas.fresh);
  root.style.setProperty('--due', theme.canvas.due);
  root.style.setProperty('--overdue', theme.canvas.overdue);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  root.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.css.surface);
}

// ---------- colour helpers ----------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance (0 = black, 1 = white) of an `rgb(r, g, b)` or hex colour. */
export function luminance(color: string): number {
  const rgb = color.startsWith('#') ? hexToRgb(color) : (color.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
