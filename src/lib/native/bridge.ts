/**
 * Small adapters over the browser APIs that behave differently — or not at
 * all — inside the native app. Each one falls back to the web behaviour, so
 * calling code never branches on platform.
 */
import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Dialog } from '@capacitor/dialog';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isIOS, isNative } from './platform';

// ---- feedback ---------------------------------------------------------------

/** Our own Swift plugin: which way UIKit should dress the app. */
const Appearance = registerPlugin<{ setStyle(options: { style: 'dark' | 'light' }): Promise<void> }>('Appearance');

/**
 * Dress the app's own chrome to match the palette.
 *
 * Two different things, and both are needed. The status bar draws its clock
 * and battery over our background — Capacitor's naming is the opposite of
 * what it reads like, and Style.Dark means light glyphs for a dark
 * background. And UIKit draws the controls the web view cannot: the date and
 * time wheels, selection handles, the keyboard. Those follow the window's
 * trait rather than any CSS, which is why a dark app on a phone set to Light
 * opened a white date picker in the middle of a dark sheet.
 */
export async function setStatusBarTheme(theme: 'dark' | 'light'): Promise<void> {
  if (!isNative() || !isIOS()) return;
  try {
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
  } catch {
    /* best effort */
  }
  try {
    await Appearance.setStyle({ style: theme });
  } catch {
    /* an older build without the plugin: the web view still looks right */
  }
}

export function haptic(kind: 'light' | 'medium' | 'success' = 'light'): void {
  if (!isNative()) return;
  void (kind === 'success'
    ? Haptics.notification({ type: NotificationType.Success })
    : Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light })
  ).catch(() => {});
}

// ---- clipboard --------------------------------------------------------------

export async function copyText(text: string): Promise<boolean> {
  try {
    if (isNative()) await Clipboard.write({ string: text });
    else await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---- confirmation -----------------------------------------------------------

export async function confirmAction(
  message: string,
  title = 'Are you sure?',
  /** Button wording, so the dialog can speak the language the app is set to. */
  labels: { ok?: string; cancel?: string } = {},
): Promise<boolean> {
  if (!isNative()) return window.confirm(message);
  const { value } = await Dialog.confirm({
    title,
    message,
    okButtonTitle: labels.ok ?? 'Continue',
    cancelButtonTitle: labels.cancel ?? 'Cancel',
  });
  return value;
}

// ---- export -----------------------------------------------------------------

/** A file download in the browser; the iOS share sheet in the app. */
export async function exportFile(filename: string, contents: string, mime = 'application/json'): Promise<void> {
  if (!isNative()) {
    const blob = new Blob([contents], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  await Share.share({ title: filename, url: uri, dialogTitle: 'Export your tasks' });
}

// ---- network ----------------------------------------------------------------

let online = true;
export const isOnline = () => online;

// ---- startup ----------------------------------------------------------------

/**
 * Native startup: status bar, splash, keyboard behaviour, deep links and
 * foreground/background transitions. Safe to call on the web — it returns.
 */
export async function initNative(onResume: () => void, onDeepLink: (url: string) => void): Promise<void> {
  if (!isNative()) return;

  try {
    if (isIOS()) {
      await StatusBar.setStyle({ style: Style.Dark }); // light text on our charcoal background
      // Native, not Body: the whole web view shrinks when the keyboard opens,
      // so anything anchored to the bottom — the capture bar, every sheet —
      // rises above it. With Body only the document shrank, and `position:
      // fixed` still measured the full window, which put the text field the
      // keyboard had just been opened for underneath the keyboard.
      await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
      await Keyboard.setScroll({ isDisabled: true });
    }
  } catch {
    /* status bar / keyboard are best-effort */
  }

  // Let the first paint happen before the splash goes away.
  requestAnimationFrame(() => {
    setTimeout(() => void SplashScreen.hide().catch(() => {}), 120);
  });

  await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) onResume();
  });
  await App.addListener('appUrlOpen', ({ url }) => onDeepLink(url));

  const status = await Network.getStatus();
  online = status.connected;
  await Network.addListener('networkStatusChange', (s) => {
    online = s.connected;
  });
}
