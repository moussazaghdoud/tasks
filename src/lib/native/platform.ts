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
 * What the native side can do here. Each of these needs an app-specific
 * plugin, and so far those exist in Swift only: Android gets each one as its
 * Kotlin or Java twin lands. Until then the feature is hidden there, rather
 * than offered and failing.
 */
export const can = {
  /** Copy of the list in the person's own iCloud (ICloudPlugin). */
  icloud: (): boolean => isIOS(),
  /** Sending thoughts to other people (ShareBoxPlugin, CloudKit). */
  sharing: (): boolean => isIOS(),
  /**
   * Buying Pro (StorePlugin). Where there is no store yet, Pro is simply on:
   * a paywall nobody can pay is worse than none. Play Billing must land
   * before an Android build reaches the Play Store.
   */
  store: (): boolean => isIOS(),
  /** Outlook and Google calendars (MicrosoftPlugin, GooglePlugin). */
  calendars: (): boolean => isIOS(),
  /** Reading the text in photos and QR codes (TextReaderPlugin). */
  readText: (): boolean => isIOS(),
};

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

/** The public site: the privacy policy, support and legal notice live there. */
export const SITE = 'https://ihence.app';

/** Base URL for the analysis API: same origin on the web, the deployed server in the app. */
export function apiBase(): string {
  if (!isNative()) return '';
  return normalizeBase(import.meta.env.VITE_API_BASE_URL as string | undefined);
}
