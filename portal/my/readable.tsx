// Player-facing values for my.landvas.app: nothing on screen should look like code. No JSON, no braces, no internal
// IDs, no raw column names. (The admin portal keeps its raw views; the full JSON stays in "Download everything".)
import type { ReactNode } from 'react';
import { date, dateTime, num, words } from '../shared/format';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)/;

/** an internal ID (a UUID): never shown to players */
export const isId = (v: unknown) => typeof v === 'string' && UUID.test(v);
/** a key that only holds an internal reference */
export const isIdKey = (k: string) => k === 'id' || k === 'uid' || k.endsWith('_id') || k.endsWith('_uid') || k === 'first_owner' || k === 'owner';
/** a column players have no use for: internal references, and the map's internal block numbers and sigil seeds */
export const isHiddenKey = (k: string) => isIdKey(k) || k === 'bx' || k === 'by' || k === 'sigil';
/** values that are someone's own words or names: shown exactly as they are */
const AS_IS = new Set(['username', 'display_name', 'name', 'nickname', 'title', 'email', 'bio', 'code', 'custom_code', 'default_code', 'tag', 'word', 'url', 'message', 'body', 'text', 'note', 'caption', 'city', 'born_place', 'place']);

const LABELS: Record<string, string> = {
  created_at: 'Created', updated_at: 'Updated', xp: 'XP', usd: 'USD', amount_usd: 'Amount (USD)', rate_usd_per_second: 'Rate (USD a second)',
  brush_points: 'XP', play_ms: 'Play time', gx: 'Plot across', gy: 'Plot down', pct: 'Percent', n: 'Count', ok: 'OK',
};

/** a column or field name the way a player would say it (laid_at → Laid, play_ms → Play time) */
export function fieldName(k: string) {
  if (LABELS[k]) return LABELS[k];
  return words(k.replace(/_at$/, '').replace(/_ms$/, ' time').replace(/_usd$/, ' (USD)'));
}

function prim(v: unknown, k?: string): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return num(v, Number.isInteger(v) ? 0 : 6);
  const s = String(v);
  if (isId(s)) return '';
  if (ISO.test(s)) return s.length > 10 ? dateTime(s) : date(s);
  if (k && AS_IS.has(k)) return s;
  // an internal name (epic, claim_starter, roll_free) reads as words: Epic, Claim starter, Roll free
  if (/^[a-z][a-z0-9]*(?:[_.][a-z0-9]+)*$/.test(s)) return words(s);
  return s;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** a value as plain words: lists as "a, b, c", objects as "Label: value · Label: value", long data summarised */
export function plain(v: unknown, max = 120, key?: string): string {
  if (Array.isArray(v)) {
    if (!v.length) return '';
    if (v.every((x) => !x || typeof x !== 'object')) return clip(v.map((x) => prim(x, key)).filter(Boolean).join(', '), max);
    // a list of things with names reads as their names
    const names = v.map((x) => (isObj(x) ? (x.name ?? x.title ?? x.username ?? x.label) : null)).filter((x): x is string => typeof x === 'string' && !!x);
    if (names.length === v.length) return clip(names.join(', '), max);
    return `${v.length.toLocaleString('en-US')} item${v.length === 1 ? '' : 's'}`;
  }
  if (isObj(v)) {
    if ('__clip' in v) {
      const p = String(v.preview ?? '');
      return /^\s*[[{]/.test(p) ? 'Saved game data (in your download)' : clip(p, max);
    }
    const parts = Object.entries(v)
      .filter(([k, x]) => !isHiddenKey(k) && !isId(x) && x !== null && x !== undefined && x !== '')
      .map(([k, x]) => {
        // deeper game data (an enchantment's inner workings, a creature's genes) stays in the download
        const s = Array.isArray(x) ? (x.length ? `${x.length} item${x.length === 1 ? '' : 's'}` : '') : isObj(x) ? '' : prim(x, k);
        return s ? `${fieldName(k)}: ${s}` : '';
      })
      .filter(Boolean);
    return clip(parts.join(' · '), max);
  }
  return clip(prim(v, key), max);
}

/** a value in a player's table cell */
export function Readable({ v, k, max = 80 }: { v: unknown; k?: string; max?: number }): ReactNode {
  const s = plain(v, 400, k);
  if (!s) return <span className="text-faint">—</span>;
  return <span title={s.length > max ? s : undefined}>{clip(s, max)}</span>;
}
