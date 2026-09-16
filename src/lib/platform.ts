export { clsx as cn } from 'clsx';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const MOD = isMac ? '⌘' : 'Ctrl';

/** Render a shortcut like "mod+k" as platform keys. */
export function keyLabel(combo: string): string[] {
  return combo.split('+').map((k) => {
    switch (k) {
      case 'mod':
        return MOD;
      case 'shift':
        return '⇧';
      case 'alt':
        return isMac ? '⌥' : 'Alt';
      case 'enter':
        return '↵';
      case 'backspace':
        return '⌫';
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      case 'esc':
        return 'Esc';
      case 'space':
        return 'Space';
      default:
        return k.length === 1 ? k.toUpperCase() : k;
    }
  });
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function isModEvent(e: { metaKey: boolean; ctrlKey: boolean }) {
  return isMac ? e.metaKey : e.ctrlKey;
}
