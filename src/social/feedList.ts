/** the latest window from the server replaces that span of the list; older rows (from "Show older") stay */
export function reconcile<T extends { id: number }>(have: T[], fresh: T[], limit: number): T[] {
  if (fresh.length < limit) return fresh; // that's everything there is to see
  const oldest = fresh[fresh.length - 1].id;
  return dedupe([...fresh, ...have.filter((x) => x.id < oldest)]).slice(0, 400);
}

export const dedupe = <T extends { id: number }>(list: T[]) => {
  const seen = new Set<number>();
  return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
};
