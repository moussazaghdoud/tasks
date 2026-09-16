import type { Person } from '@/domain/types';
import { cn } from '@/lib/platform';

const TONES = ['#d9e4e1', '#e3e1ef', '#efe2d9', '#e3e6d6', '#ece0e8', '#efe6d2', '#dfe3e7'];
const INKS = ['#1e5a5a', '#3f4a8a', '#8a4a2e', '#556128', '#6d3f63', '#7d5d1d', '#465360'];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function Avatar({ person, size = 20, className }: { person: Pick<Person, 'id' | 'name'>; size?: number; className?: string }) {
  const i = hash(person.id) % TONES.length;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight select-none', className)}
      style={{ width: size, height: size, background: TONES[i], color: INKS[i], fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {initials(person.name)}
    </span>
  );
}
