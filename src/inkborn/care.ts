// Shared bits for caring for Inkborn: bond levels and the words a creature says back.
export const BOND_LEVELS = [
  { at: 0, name: 'New friend' }, { at: 10, name: 'Pal' }, { at: 40, name: 'Buddy' },
  { at: 100, name: 'Close friend' }, { at: 250, name: 'Best friend' }, { at: 600, name: 'Soulmate' },
] as const;

export function bondLevel(bond: number) {
  let i = 0;
  while (i + 1 < BOND_LEVELS.length && bond >= BOND_LEVELS[i + 1].at) i++;
  const cur = BOND_LEVELS[i], next = BOND_LEVELS[i + 1];
  return { level: i + 1, name: cur.name, next: next?.name ?? null, progress: next ? (bond - cur.at) / (next.at - cur.at) : 1, toNext: next ? next.at - bond : 0 };
}

export const REACTIONS: Record<string, string> = {
  purr: '♥', yum: 'Yum!', full: 'So full…', yay: 'Yay!', tired: 'Too sleepy to play…',
  shiny: 'So shiny!', fluffy: 'Already fluffy!', fetch: 'Again! Again!', trick: 'Ta-da!', unsure: 'Huh? (tricks come once you’re Pals)',
  splash: 'Splish splash!', clean: 'Squeaky clean already', found: 'You found me!', again: 'Let’s play something else',
};

export function moodWord(happiness: number) {
  return happiness >= 85 ? 'Overjoyed' : happiness >= 65 ? 'Happy' : happiness >= 45 ? 'Content' : 'Wants attention';
}
export function energyWord(energy: number) {
  return energy >= 70 ? 'Full of beans' : energy >= 40 ? 'Rested' : energy >= 15 ? 'Getting sleepy' : 'Needs a nap';
}
