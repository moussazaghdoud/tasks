export type SpeechErrorCode = 'not-allowed' | 'no-speech' | 'audio-capture' | 'network' | 'unsupported' | 'other';

export interface SpeechCallbacks {
  /** Called on every update with the confirmed text and the in-flight guess. */
  onText: (finalText: string, interim: string) => void;
  onError: (code: SpeechErrorCode) => void;
  /** Recognition stopped (user stop, silence, or the engine ending the session). */
  onEnd: () => void;
}

export interface SpeechSession {
  /** Stop listening and keep what was heard. */
  stop: () => void;
  /** Stop listening and discard. */
  abort: () => void;
}
