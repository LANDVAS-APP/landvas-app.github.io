// Money for the business: $12.34, $1,234, $12.3K … $4.56 Qi. Big numbers stay short and readable.
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const WORDS = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion'];

export function money(n: number, opts: { cents?: boolean; words?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '$∞';
  const neg = n < 0; n = Math.abs(n);
  let s: string;
  if (n < 1000) s = opts.cents || n < 10 ? (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: n < 10 && n % 1 ? 2 : 0, maximumFractionDigits: 2 }) : Math.floor(n).toLocaleString();
  else if (n < 1e6 && !opts.words) s = Math.floor(n).toLocaleString();
  else {
    const i = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
    const v = n / 10 ** (i * 3);
    s = `${v.toFixed(v >= 100 ? 1 : 2)}${opts.words ? ' ' + WORDS[i] : SUFFIX[i]}`;
  }
  return `${neg ? '-' : ''}$${s}`;
}
export const perSec = (n: number) => `${money(n)}/s`;

/** Your title as a tycoon, by everything you've ever earned. */
export const RANKS: [number, string, string][] = [
  [0, 'Kid with a stand', '🧒'], [1e3, 'Neighbourhood hustler', '🛹'], [1e5, 'Small-business owner', '🏪'], [1e7, 'Local legend', '🏅'],
  [1e9, 'Mogul', '🎩'], [1e11, 'Tycoon', '💼'], [1e13, 'Billionaire', '💎'], [1e15, 'Mega-corp CEO', '🏙️'], [1e18, 'Galactic CEO', '🌌'],
];
export function rankOf(alltime: number) { let r = RANKS[0]; for (const x of RANKS) if (alltime >= x[0]) r = x; const i = RANKS.indexOf(r); return { title: r[1], emoji: r[2], next: RANKS[i + 1] ?? null }; }
export const duration = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s` : `${Math.ceil(s)}s`);
