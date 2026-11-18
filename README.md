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

Data is saved in the browser and, once sync is connected (cloud icon in the header), shared across every device that uses the same sync password. **⋯ → Export backup** still works as an offline backup.

## Development

```bash
npm install
npm run dev
```

`npm run dev` also serves the `/api` sync functions with an in-memory store. The local sync password is `dev` unless you set `CLEANUP_PASSWORD` in `.env.local`.

## Deploying to Vercel

This is a static Vite + React app, so Vercel auto-detects it with no config:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

Either import the repo in the Vercel dashboard, or run `npx vercel` from this folder.

### Turning on sync (one-time)

1. **Add storage:** in the Vercel project, go to **Storage → Create / Connect → Upstash for Redis** (from the Marketplace; the free plan is plenty) and connect it to this project. That adds the `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars.
2. **Set a password:** in **Settings → Environment Variables**, add `CLEANUP_PASSWORD` with a long passphrase. Anyone with it can view and edit your house.
3. **Redeploy** so the functions pick up the new variables.
4. In the app on each device, click the cloud icon and enter the passphrase.

### How sync works

- `api/sync.ts`: `GET` returns the shared house, and `POST` merges a device's copy into it and returns the result.
- `api/image.ts` stores the floor plan image separately.
- Merging is last-writer-wins per object, with separate timestamps for layout edits and cleaning records, so tapping "cleaned" on a phone never clobbers a rename on a laptop. Deletes are kept as tombstones. Each device syncs about 1 second after a change, every 30 seconds, and whenever the app regains focus.

## Stack

Vite, React 18, TypeScript, [react-konva](https://konvajs.org/docs/react/) for the canvas, Zustand (persisted to localStorage) for state, and Vercel Functions + Upstash Redis for sync.
