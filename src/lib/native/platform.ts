import { Capacitor } from '@capacitor/core';

/**
 * One place to ask "are we inside the native app?".
 *
 * Everything native is behind dynamic imports so the web bundle never loads
 * plugin code it cannot use, and the browser build stays unchanged.
 */
export const isNative = (): boolean => Capacitor.isNativePlatform();
export const isIOS = (): boolean => Capacitor.getPlatform() === 'ios';

/** Base URL for the analysis API: same origin on the web, the deployed server in the app. */
export function apiBase(): string {
  if (!isNative()) return '';
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return (configured ?? '').replace(/\/$/, '');
}
