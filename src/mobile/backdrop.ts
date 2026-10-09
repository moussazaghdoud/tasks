import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { useSyncExternalStore } from 'react';
import { isNative } from '@/lib/native/platform';

/**
 * A picture behind the list, chosen like a style.
 *
 * Three kinds: art the app draws itself (gradients, light in light mode and
 * deep in dark), photographs that ship with the app, and one of the person's
 * own. Their own is copied into the app's storage — in its own folder, out
 * of reach of the sweep that clears photographs no thought refers to — and
 * never leaves the phone.
 */

export const ARTS = ['dawn', 'lagoon', 'dusk', 'meadow', 'mist', 'aurora', 'dunes', 'night'] as const;
export type Art = (typeof ARTS)[number];

/**
 * Photographs that ship with the app, under public/backdrops/: free under
 * the Unsplash License (no Unsplash+ images, which need a subscription),
 * cropped to the screen. Credits in public/backdrops/CREDITS.txt.
 */
export const PHOTOS: Array<{ id: string; src: string }> = [
  { id: 'mountains', src: '/backdrops/mountains.jpg' },
  { id: 'river', src: '/backdrops/river.jpg' },
  { id: 'meadow', src: '/backdrops/meadow.jpg' },
  { id: 'lake-tree', src: '/backdrops/lake-tree.jpg' },
  { id: 'bare-tree', src: '/backdrops/bare-tree.jpg' },
  { id: 'mountain-lake', src: '/backdrops/mountain-lake.jpg' },
];

export type Backdrop = { kind: 'none' } | { kind: 'art'; id: Art } | { kind: 'photo'; id: string } | { kind: 'mine'; version: number };

const KEY = 'hence.backdrop';
const FOLDER = 'backdrop';
const MINE = `${FOLDER}/mine.jpg`;

function parse(raw: string | null): Backdrop {
  if (!raw) return { kind: 'none' };
  const [kind, value] = raw.split(':');
  if (kind === 'art' && (ARTS as readonly string[]).includes(value)) return { kind: 'art', id: value as Art };
  if (kind === 'photo' && PHOTOS.some((p) => p.id === value)) return { kind: 'photo', id: value };
  if (kind === 'mine') return { kind: 'mine', version: Number(value) || 0 };
  return { kind: 'none' };
}

const serialise = (b: Backdrop): string =>
  b.kind === 'none' ? '' : b.kind === 'mine' ? `mine:${b.version}` : `${b.kind}:${b.id}`;

function read(): Backdrop {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return { kind: 'none' };
  }
}

let current: Backdrop = read();
const listeners = new Set<() => void>();

export const backdrop = (): Backdrop => current;

export function setBackdrop(next: Backdrop): void {
  current = next;
  try {
    if (next.kind === 'none') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, serialise(next));
  } catch {
    /* this session only */
  }
  listeners.forEach((l) => l());
}

export const useBackdrop = (): Backdrop =>
  useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => current,
    () => ({ kind: 'none' }) as Backdrop,
  );

/** Tells the stylesheet a picture is behind the list, so cards turn to glass. */
export function applyBackdrop(b: Backdrop): void {
  const root = document.documentElement;
  if (b.kind === 'none') root.removeAttribute('data-backdrop');
  else root.setAttribute('data-backdrop', b.kind);
}

/** Where the person's own background can be shown from, if they chose one. */
export async function myPhotoUrl(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { uri } = await Filesystem.getUri({ path: MINE, directory: Directory.Data });
    await Filesystem.stat({ path: MINE, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
}

/**
 * Pick a photograph from the library to sit behind the list. iOS's own
 * picker is used, so the app sees only the one photo chosen. Resolves false
 * when the picker was closed without one.
 */
export async function pickMyPhoto(): Promise<boolean> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Base64,
      quality: 78,
      width: 1600,
      correctOrientation: true,
    });
    if (!photo.base64String) return false;
    await Filesystem.writeFile({ path: MINE, data: photo.base64String, directory: Directory.Data, recursive: true });
    // A new version each time, so the picture on screen is not a cached one.
    setBackdrop({ kind: 'mine', version: Date.now() });
    return true;
  } catch {
    return false;
  }
}
