// Helpers shared by the LANDVAS Edge Functions (Deno, Supabase Edge Runtime).
import { createClient } from '@supabase/supabase-js';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void };

export const env = (k: string) => Deno.env.get(k) ?? '';
export const serve = (h: (req: Request) => Response | Promise<Response>) => Deno.serve(h);

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

/** Service-role client: these functions are the only holders of the service key. */
export function adminClient() {
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  return createClient(env('SUPABASE_URL'), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The calling player, from their access token (works with legacy and new signing keys). A token already checked by
 * this warm worker is remembered until it expires, so a match's moves skip the round trip to the auth server. */
const seen = new Map<string, { uid: string; exp: number }>();
export async function callerId(req: Request, admin = adminClient()): Promise<string | null> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const now = Date.now() / 1000;
  const hit = seen.get(jwt);
  if (hit && hit.exp > now + 5) return hit.uid;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  let exp = now + 60;
  try { exp = Math.min(Number(JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp) || exp, now + 3600); } catch { /* keep a minute */ }
  if (seen.size > 5000) seen.clear();
  seen.set(jwt, { uid: data.user.id, exp });
  return data.user.id;
}
