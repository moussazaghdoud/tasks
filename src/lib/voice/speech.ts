/**
 * Speech recognition, whichever platform we're on.
 *
 * Web: the browser's Web Speech API.
 * Native app: Apple's SFSpeechRecognizer through our own Swift plugin —
 * WKWebView has no Web Speech API at all, so this isn't an optimization,
 * it's the only thing that works there.
 */
import { isNative } from '@/lib/native/platform';
import { onNativeLevel, startNativeSpeech } from './nativeSpeech';
import { startWebLevelMeter, startWebSpeech, webSpeechSupported } from './webSpeech';
import type { SpeechCallbacks, SpeechSession } from './speechTypes';

export type { SpeechCallbacks, SpeechErrorCode, SpeechSession } from './speechTypes';

export const speechSupported = (): boolean => (isNative() ? true : webSpeechSupported());

/**
 * Listen. Given several languages, the native app runs one recogniser per
 * language on the same audio and keeps the transcript that reads like the
 * language it was transcribed in; the first is the one shown while speaking.
 * The web falls back to the first, which is all a browser can do.
 */
export function startSpeech(lang: string | string[], cb: SpeechCallbacks): SpeechSession {
  const langs = Array.isArray(lang) ? lang : [lang];
  return isNative() ? startNativeSpeech(langs, cb) : startWebSpeech(langs[0], cb);
}

/** Microphone level for the listening animation. Native pushes it from the audio tap. */
export async function startLevelMeter(onLevel: (level: number) => void): Promise<() => void> {
  if (!isNative()) return startWebLevelMeter(onLevel);
  onNativeLevel(onLevel);
  return () => onNativeLevel(null);
}

export function defaultSpeechLang(): string {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  if (/^fr/i.test(lang)) return 'fr-FR';
  if (/^en-(GB|IE|AU|NZ|IN|ZA)/i.test(lang)) return lang;
  return 'en-US';
}
