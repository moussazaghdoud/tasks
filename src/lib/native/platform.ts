import { Capacitor } from '@capacitor/core';

/**
 * One place to ask "are we inside the native app?".
 *
 * Everything native is behind dynamic imports so the web bundle never loads
 * plugin code it cannot use, and the browser build stays unchanged.
 */
export const isNative = (): boolean => Capacitor.isNativePlatform();
export const isIOS = (): boolean => Capacitor.getPlatform() === 'ios';

/**
 * Tidy whatever was typed into the build variable.
 *
 * A host with no scheme ("example.railway.app") is the easy mistake to make,
 * and it fails in a way that looks like the server being down: the app treats
 * it as a relative path, asks capacitor://localhost for it, gets nothing, and
 * quietly falls back to on-device analysis. Assume https rather than punish
 * the typo.
 */
export function normalizeBase(value: string | undefined): string {
  const raw = (value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  // A bare host, or someone who typed "//host".
  return `https://${raw.replace(/^\/+/, '')}`;
}

/** Base URL for the analysis API: same origin on the web, the deployed server in the app. */
export function apiBase(): string {
  if (!isNative()) return '';
  return normalizeBase(import.meta.env.VITE_API_BASE_URL as string | undefined);
}
