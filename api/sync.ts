import { emptyDoc, isSyncDoc, mergeDocs, type SyncDoc } from './_lib/merge.js';
import { checkAuth, getKV, json, noStorage } from './_lib/server.js';

/** Fetch the shared house. */
export async function GET(req: Request): Promise<Response> {
  const denied = checkAuth(req);
  if (denied) return denied;
  const kv = getKV();
  if (!kv) return noStorage();
  return json({ doc: await kv.get<SyncDoc>('doc') });
}

/** Merge a device's copy into the shared house and return the merged result. */
export async function POST(req: Request): Promise<Response> {
  const denied = checkAuth(req);
  if (denied) return denied;
  const kv = getKV();
  if (!kv) return noStorage();

  const body = (await req.json().catch(() => null)) as { doc?: unknown } | null;
  if (!isSyncDoc(body?.doc)) return json({ error: 'bad_request', message: 'Invalid house data.' }, 400);

  const stored = (await kv.get<SyncDoc>('doc')) ?? emptyDoc();
  const merged = mergeDocs(stored, body.doc);
  await kv.set('doc', merged);

  const oldImage = stored.plan.image?.id;
  if (oldImage && oldImage !== merged.plan.image?.id) await kv.del(`image:${oldImage}`);

  return json({ doc: merged });
}
