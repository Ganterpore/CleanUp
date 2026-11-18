import type { StoredImage } from './_lib/merge.js';
import { checkAuth, getKV, json, noStorage } from './_lib/server.js';

const ID_RE = /^[\w-]{1,64}$/;
const MAX_SRC = 4_000_000; // stay under Vercel's 4.5 MB body limit

/** Download a floor plan image by id. */
export async function GET(req: Request): Promise<Response> {
  const denied = checkAuth(req);
  if (denied) return denied;
  const kv = getKV();
  if (!kv) return noStorage();
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!ID_RE.test(id)) return json({ error: 'bad_request' }, 400);
  const img = await kv.get<StoredImage>(`image:${id}`);
  return img ? json(img) : json({ error: 'not_found' }, 404);
}

/** Upload a floor plan image (a downscaled JPEG data URL). */
export async function PUT(req: Request): Promise<Response> {
  const denied = checkAuth(req);
  if (denied) return denied;
  const kv = getKV();
  if (!kv) return noStorage();
  const img = (await req.json().catch(() => null)) as StoredImage | null;
  if (
    !img ||
    !ID_RE.test(img.id) ||
    typeof img.src !== 'string' ||
    !img.src.startsWith('data:image/') ||
    img.src.length > MAX_SRC ||
    !(img.width > 0 && img.height > 0)
  ) {
    return json({ error: 'bad_request', message: 'Invalid or too-large image.' }, 400);
  }
  await kv.set(`image:${img.id}`, { id: img.id, src: img.src, width: img.width, height: img.height });
  return json({ ok: true });
}
