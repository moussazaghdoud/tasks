/** Ids of tasks created moments ago, so their rows can play the entry animation once. */
const fresh = new Set<string>();

export function markFresh(ids: string[]) {
  for (const id of ids) fresh.add(id);
  setTimeout(() => ids.forEach((id) => fresh.delete(id)), 1200);
}

export const isFresh = (id: string) => fresh.has(id);
