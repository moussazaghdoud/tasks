/**
 * Speech recognition inside the native app, via the Swift plugin in
 * `ios/App/App/SpeechPlugin.swift` (Apple's SFSpeechRecognizer).
 *
 * WKWebView has no Web Speech API, so this is the only way voice works in the
 * app — and it is better: more accurate, real French support, and it reports
 * the microphone level for the listening animation.
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { speechHints } from './hints';
import type { SpeechCallbacks, SpeechErrorCode, SpeechSession } from './speechTypes';

interface SpeechPlugin {
  available(options: { locale: string }): Promise<{ available: boolean; onDevice: boolean }>;
  checkPermissions(): Promise<{ speech: string; microphone: string }>;
  requestPermissions(): Promise<{ speech: string; microphone: string }>;
  start(options: { locale: string; partialResults: boolean; onDevice?: boolean; contextualStrings?: string[] }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'result', fn: (e: { text: string; isFinal: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'level', fn: (e: { level: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', fn: (e: { code: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'end', fn: () => void): Promise<PluginListenerHandle>;
}

const Speech = registerPlugin<SpeechPlugin>('Speech');

const ERROR_MAP: Record<string, SpeechErrorCode> = {
  permission: 'not-allowed',
  unavailable: 'unsupported',
  audio: 'audio-capture',
  recognition: 'other',
  nospeech: 'no-speech',
  network: 'network',
  // Capacitor's own code when nothing answers on the native side. It means the
  // build is wrong, not the device or the language, so keep it distinguishable
  // — reading it as "unsupported" sends the next person hunting the wrong bug.
  UNIMPLEMENTED: 'plugin-missing',
};

/** Microphone level pushed by the plugin; the overlay subscribes to it. */
let levelListener: ((level: number) => void) | null = null;
export function onNativeLevel(fn: ((level: number) => void) | null) {
  levelListener = fn;
}

export function startNativeSpeech(lang: string, cb: SpeechCallbacks): SpeechSession {
  const handles: PluginListenerHandle[] = [];
  let finalText = '';
  let stopped = false;

  const cleanup = () => {
    for (const h of handles) void h.remove();
    handles.length = 0;
  };

  void (async () => {
    try {
      const granted = await Speech.requestPermissions();
      if (granted.speech !== 'granted' || granted.microphone !== 'granted') {
        cb.onError('not-allowed');
        return;
      }
      const { available } = await Speech.available({ locale: lang });
      if (!available) {
        cb.onError('unsupported');
        return;
      }

      handles.push(
        await Speech.addListener('result', ({ text, isFinal }) => {
          // The native recognizer reports the whole utterance each time.
          if (isFinal) {
            finalText = text;
            cb.onText(text, '');
          } else {
            cb.onText(finalText, text.slice(finalText.length).trim() || text);
          }
        }),
      );
      handles.push(await Speech.addListener('level', ({ level }) => levelListener?.(level)));
      handles.push(
        await Speech.addListener('error', ({ code }) => {
          if (stopped) return;
          cb.onError(ERROR_MAP[code] ?? 'other');
        }),
      );
      handles.push(
        await Speech.addListener('end', () => {
          cleanup();
          cb.onEnd();
        }),
      );

      // The names and projects this person actually talks about, so the
      // recogniser spells them right the first time.
      await Speech.start({ locale: lang, partialResults: true, contextualStrings: speechHints() });
    } catch (error) {
      cleanup();
      const code = (error as { code?: string })?.code;
      cb.onError(ERROR_MAP[code ?? ''] ?? 'other');
    }
  })();

  return {
    // Finishing normally: keep listening for the final transcript, and let the
    // plugin decide which of the errors that follow are worth reporting.
    stop: () => {
      void Speech.stop();
    },
    abort: () => {
      stopped = true;
      cleanup();
      void Speech.stop();
    },
  };
}
