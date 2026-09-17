/**
 * Which copy of the app is this?
 *
 * On the web the version from package.json is enough. In the native app the
 * build number is the part that moves — two TestFlight builds can share a
 * version — so it is shown alongside, which is what makes a tester's report
 * ("build 9 still fails") worth anything.
 */
import { App } from '@capacitor/app';
import { isNative } from './native/platform';

/** Baked in at build time. */
export const WEB_VERSION = __APP_VERSION__;

export async function readVersion(): Promise<string> {
  if (!isNative()) return WEB_VERSION;
  try {
    const { version, build } = await App.getInfo();
    return `${version} (${build})`;
  } catch {
    return WEB_VERSION;
  }
}
