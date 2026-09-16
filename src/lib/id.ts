/** Collision-resistant, URL-safe, time-sortable id. */
export function createId(prefix = ''): string {
  const time = Date.now().toString(36);
  const rand =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('')
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}${time}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
