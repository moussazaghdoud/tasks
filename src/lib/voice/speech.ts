/**
 * Thin wrapper over the Web Speech API (Chrome, Edge, Safari; not Firefox).
 * Speech is transcribed by the browser; only the resulting text is analyzed.
 */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => ctor() !== null;

export type SpeechErrorCode = 'not-allowed' | 'no-speech' | 'audio-capture' | 'network' | 'unsupported' | 'other';

export interface SpeechCallbacks {
  /** Called on every update with the confirmed text and the in-flight guess. */
  onText: (finalText: string, interim: string) => void;
  onError: (code: SpeechErrorCode) => void;
  /** The recognizer stopped (user stop, silence, or the browser ending the session). */
  onEnd: () => void;
}

export interface SpeechSession {
  /** Stop listening and keep what was heard. */
  stop: () => void;
  /** Stop listening and discard. */
  abort: () => void;
}

export function startSpeech(lang: string, cb: SpeechCallbacks): SpeechSession {
  const Ctor = ctor();
  if (!Ctor) {
    cb.onError('unsupported');
    return { stop: () => {}, abort: () => {} };
  }
  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = '';
  let ended = false;

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText = `${finalText} ${r[0].transcript}`.trim();
      else interim += r[0].transcript;
    }
    cb.onText(finalText, interim.trim());
  };
  rec.onerror = (e) => {
    const map: Record<string, SpeechErrorCode> = {
      'not-allowed': 'not-allowed',
      'service-not-allowed': 'not-allowed',
      'no-speech': 'no-speech',
      'audio-capture': 'audio-capture',
      network: 'network',
    };
    if (e.error === 'aborted') return;
    cb.onError(map[e.error] ?? 'other');
  };
  rec.onend = () => {
    if (ended) return;
    ended = true;
    cb.onEnd();
  };

  try {
    rec.start();
  } catch {
    cb.onError('other');
  }

  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
    abort: () => {
      ended = true;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}

/**
 * Microphone level (0–1) for the listening animation. Optional: if the mic
 * can't be opened here, the UI falls back to a gentle idle pulse.
 */
export async function startLevelMeter(onLevel: (level: number) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) return () => {};
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return () => {};
  }
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  let smooth = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / data.length);
    smooth = smooth * 0.75 + Math.min(1, rms * 4) * 0.25;
    onLevel(smooth);
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
}

export function defaultSpeechLang(): string {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  if (/^fr/i.test(lang)) return 'fr-FR';
  if (/^en-(GB|IE|AU|NZ|IN|ZA)/i.test(lang)) return lang;
  return 'en-US';
}
