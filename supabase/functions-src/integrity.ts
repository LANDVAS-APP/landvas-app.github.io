// POST /integrity — the app reports a session (device id, fingerprint, emulator/automation checks). This function adds
// what only the server can see: the caller's real address. The database stores only a salted hash of it (and of its
// network) — never the address itself. New addresses are looked up once a week for VPN / proxy / Tor / datacenter use,
// country and provider (ipapi.is; set IPAPI_KEY for a higher limit), so the cheat scanner can weigh them.
import { adminClient, callerId, cors, env, json, serve } from './shared';

function clientIp(req: Request) {
  const h = req.headers;
  const v = h.get('cf-connecting-ip') || (h.get('x-forwarded-for') ?? '').split(',')[0] || h.get('x-real-ip') || '';
  const ip = v.trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

async function lookup(ip: string) {
  const key = env('IPAPI_KEY');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3500);
  try {
    const res = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}${key ? `&key=${encodeURIComponent(key)}` : ''}`, { signal: ctl.signal });
    if (!res.ok) return null;
    const j = await res.json() as Record<string, any>;
    return {
      country: j.location?.country_code ?? null, asn: j.asn?.asn ?? null, as_org: j.asn?.org ?? j.company?.name ?? null,
      vpn: !!j.is_vpn, proxy: !!j.is_proxy, tor: !!j.is_tor, datacenter: !!j.is_datacenter, mobile: !!j.is_mobile, source: 'ipapi.is',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = adminClient();
  const uid = await callerId(req, admin);
  if (!uid) return json({ error: 'not_signed_in' }, 401);
  let signals: unknown = {};
  try { signals = await req.json(); } catch { /* empty is fine */ }
  const ip = clientIp(req);
  const { data, error } = await admin.rpc('svc_integrity_ping', { p_player: uid, p_ip: ip, p_signals: signals ?? {} });
  if (error) return json({ error: error.message }, 500);
  if (ip && (data as { lookup?: boolean } | null)?.lookup) {
    const intel = await lookup(ip);
    if (intel) await admin.rpc('svc_integrity_intel', { p_ip: ip, p_intel: intel });
  }
  return json({ ok: true });
});
