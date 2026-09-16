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
    // Match the app's paper background so rubber-band scrolling doesn't flash white.
    backgroundColor: '#f1efe9',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#f1efe9',
      showSpinner: false,
    },
    Keyboard: {
      // The app manages its own layout; resizing the body keeps the composer visible.
      resize: 'body' as never,
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
