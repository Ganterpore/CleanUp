# CleanUp

A house-cleaning habit tracker. Draw your home's rooms and fixtures over a floor plan, give each one a cleaning interval, and tap them as you clean. Everything starts white and fades to red, reaching full red at twice its interval.

## Using it

**Setup mode**
- Upload a floor plan image (or start on a blank grid).
- Use the left palette to pick **Room** or **Item**, then a shape (rectangle, triangle, oval), and drag to draw.
  - Rooms can't overlap. Their edges snap to nearby rooms (pink guide lines show the snap).
  - An item has to sit inside a room. Moving a room moves its items too.
- Select a shape to rename it, set **Clean every N days**, rotate or flip triangles, set its starting state, or delete it.
- Shortcuts: `V` select, `R` rectangle, `T` triangle, `O` oval, `Shift` for equal sides, `⌘Z`/`⇧⌘Z` undo/redo, `Delete`, `Esc`.

**Track mode**
- Tap a room or item to mark it cleaned (the toast has an Undo). The side list is sorted with the most overdue first.

Data lives in the browser's localStorage. To move between devices, use **⋯ → Export backup / Import backup**.

## Development

```bash
npm install
npm run dev
```

## Deploying to Vercel

This is a static Vite + React app, so Vercel auto-detects it with no config:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

Either import the repo in the Vercel dashboard, or run `npx vercel` from this folder.

## Stack

Vite, React 18, TypeScript, [react-konva](https://konvajs.org/docs/react/) for the canvas, and Zustand (persisted to localStorage) for state.
