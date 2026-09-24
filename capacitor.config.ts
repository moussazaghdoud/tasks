import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell configuration.
 *
 * The bundle identifier must match the App ID in your Apple Developer account
 * and the app record in App Store Connect. Change `appId` here, in
 * `ios/App/App.xcodeproj/project.pbxproj` (PRODUCT_BUNDLE_IDENTIFIER) and in
 * `fastlane/Appfile` if you use a different one.
 */
const config: CapacitorConfig = {
  appId: 'com.moussazaghdoud.hence',
  appName: 'Hence',
  webDir: 'dist',
  ios: {
    // Let the web layer handle the safe areas itself (env(safe-area-inset-*)).
    contentInset: 'never',
    // Match the app's graphite background so rubber-band scrolling doesn't flash white.
    backgroundColor: '#232326',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#232326',
      showSpinner: false,
    },
    Keyboard: {
      // Resize the web view itself, so bottom-anchored sheets sit on top of
      // the keyboard instead of behind it.
      resize: 'native' as never,
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#1e676c',
      // Show reminders even when the app is open, not only in the background.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
