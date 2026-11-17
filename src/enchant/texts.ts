// The words the owner set in the Enchantment editor (admin portal → Enchantments): each enchantment's tagline and
// how-it-works lines replace the built-in ones in KINDS once they've loaded (the star powers come with each
// enchantment's own view from the server). Loaded once when the game starts; nothing changes if it can't load.
import { api } from '../backend/api';
import { KINDS } from './kinds';

let loaded = false;
export async function loadEnchantTexts() {
  if (loaded) return;
  loaded = true;
  try {
    const t = await api.enchantTexts();
    for (const [k, v] of Object.entries(t ?? {})) {
      const info = KINDS[k as keyof typeof KINDS];
      if (!info || !v) continue;
      if (typeof v.tagline === 'string' && v.tagline.trim()) info.tagline = v.tagline;
      if (Array.isArray(v.how) && v.how.length) info.how = v.how.filter((l) => typeof l === 'string' && l.trim());
    }
  } catch { loaded = false; /* try again next start */ }
}
