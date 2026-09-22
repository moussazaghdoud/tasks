# Apple App Store readiness — Hence

Audit of the iOS app against App Store Review requirements, carried out on the
repository as it stands. Every entry is based on the code and configuration, with
the file that proves it.

**Status key** — **PASS** already correct · **FIXED** corrected in this audit ·
**MANUAL** needs you, outside the repository · **N/A** does not apply · **BLOCKED**
cannot proceed without a decision

> The audit brief arrived truncated partway through section 2 (at *"uses the microphone
> only whe…"*). Everything written was covered; the sections that clearly followed —
> privacy, notifications, calendar, email, accessibility, review notes — were audited to
> the same standard. If the missing text held specific requirements, send it and they
> will be checked.

---

## Before you submit — what only you can do

| # | Action | Why it blocks |
|---|---|---|
| 1 | **Replace `REPLACE_WITH_YOUR_EMAIL`** in `public/privacy.html` and `public/support.html` | A privacy policy and support page with a placeholder contact are an automatic rejection. Your email is not written in by the audit because it publishes on a public page. |
| 2 | **Retake the screenshots.** The six in `docs/store/` show the original light design, which no longer exists. | Screenshots must show the app as it is (Guideline 2.3.3). |
| 3 | **Decide how a reviewer tests the Agenda** — see *Review notes* below. | The feature needs a Microsoft 365 account a reviewer does not have. |
| 4 | **Fill the App Privacy answers** in App Store Connect exactly as listed in section 3. | They must match the privacy manifest and policy. |
| 5 | **Confirm the week agenda** shows days after tomorrow on your phone (open question, section 9). | A feature that silently shows less than it claims is a reliability defect. |

---

## Summary of the project

| Item | Value | Evidence |
|---|---|---|
| Framework | React 19 + TypeScript, built with Vite 8, wrapped by **Capacitor 8.5.2** | `package.json`, `capacitor.config.ts` |
| Native project | `ios/App/App.xcodeproj`, Swift Package Manager (no CocoaPods) | `ios/App/CapApp-SPM/Package.swift` |
| Own native code | `SpeechPlugin.swift` (speech), `MicrosoftPlugin.swift` (Outlook), `AppViewController.swift` (registers both) | `ios/App/App/` |
| Bundle identifier | `com.moussazaghdoud.hence` | `capacitor.config.ts:12`, `project.pbxproj`, `fastlane/Fastfile` |
| Version | `1.0.0` from `package.json`, injected at build time | `fastlane/Fastfile` — `MARKETING_VERSION` xcarg |
| Build number | GitHub Actions run number, always increasing | `.github/workflows/ios-release.yml` — `BUILD_NUMBER` |
| Deployment target | iOS 15.0 | `project.pbxproj` — `IPHONEOS_DEPLOYMENT_TARGET` |
| Devices | **iPhone only** (changed in this audit) | `project.pbxproj` — `TARGETED_DEVICE_FAMILY = 1` |
| Entitlements | **None.** No `.entitlements` file exists | `find ios -name "*.entitlements"` returns nothing |
| Accounts | **None of its own.** Optional Microsoft sign-in, for the calendar only | `src/mobile/microsoft.ts` |
| Backend | Own server on Railway, forwarding note text to Anthropic's Claude | `server/index.ts`, `server/voice.ts`, `Dockerfile` |
| Analytics / tracking / ads | **None.** No such dependency | `package.json` dependencies; `Package.swift` |
| Payments / subscriptions | **None** | no StoreKit, no payment dependency |
| Local data | Notes in Capacitor Preferences; agenda cache and settings in web storage; Microsoft refresh token in the Keychain | `src/data/capacitorRepository.ts`, `src/mobile/microsoft.ts`, `MicrosoftPlugin.swift` |

---

## 1. Build and release readiness

| Requirement | Status | Evidence |
|---|---|---|
| Production build completes | **PASS** | `npm run build` — exit 0, no errors or warnings. See *Commands run*. |
| Native project compiles | **PASS** | CI job *iOS compiles (unsigned)* green on commit `e5a995b`, run #50 on a macOS runner |
| No compilation errors or relevant warnings | **PASS** | `npm run typecheck` (`tsc -b --force`) exit 0. Deprecated iOS 17 record-permission calls replaced — see below |
| Release does not point to development servers | **PASS** | Release reads `API_BASE_URL` = the production Railway server. `grep` for `localhost`, `127.0.0.1`, `:5173`, `:3000` in shipped code finds only a code comment |
| No debug menus in Release | **PASS** | `CAPACITOR_DEBUG = true` lives in `ios/debug.xcconfig`, attached to the two **Debug** configurations only; Release has no base configuration, so the web inspector is off |
| No sample data shown to users | **FIXED** | A first launch seeded **29 demo tasks naming real people** (*"Call Nicolas about candidate"*). The phone app now starts empty. `src/store/workspace.ts` — `init` |
| No placeholder text | **MANUAL** | `REPLACE_WITH_YOUR_EMAIL` in `public/privacy.html` and `public/support.html`. See action 1 |
| No unfinished screen or "coming soon" | **PASS** | No `coming soon`, `TODO` or `lorem` in `src/`, `public/`, `server/` |
| Version and build number valid and documented | **PASS** | See summary. The `1.0` / `1` defaults in `project.pbxproj` are overridden on every release build |
| Bundle identifier consistent | **PASS** | Same value in Capacitor config, both Xcode configurations, Fastfile, workflow, and the Entra redirect `msauth.com.moussazaghdoud.hence://auth` |
| Signing suitable for App Store | **PASS** | `match` type `appstore`; `update_code_signing_settings` sets manual signing with *Apple Distribution* at build time. `fastlane/Fastfile` — `beta` lane |
| App icon | **PASS** | `AppIcon-512@2x.png`, 1024×1024, **RGB with no alpha** (Apple rejects transparent marketing icons) |
| Launch screen | **PASS** | `LaunchScreen.storyboard`, graphite to match the app |
| Required device capabilities | **FIXED** | Declared `armv7`, a 32-bit architecture no iPhone on iOS 15 uses. Now `arm64`. `Info.plist` |
| Supported screen sizes | **FIXED** / **MANUAL** | The app was also built for **iPad**, where the wide screen rendered the desktop layout — never designed or tested for touch. Now iPhone-only. Layout uses safe-area insets and flexible widths; confirm by eye on a small (SE) and a large (Pro Max) iPhone |
| Survives termination and relaunch | **FIXED** | The Outlook connection survived in the Keychain, but nothing checked it at launch, so the agenda read as disconnected. `src/mobile/MobileApp.tsx`, `src/mobile/microsoft.ts` — `refreshAccount` |
| User data persists | **PASS** | Notes written through the repository on every change. `src/data/capacitorRepository.ts` |
| Offline and poor network | **PASS** | Note analysis falls back to the device; the agenda shows its last copy with *"Offline · as of 14:32"*; transcription failures say a connection is needed. `src/lib/voice/analyze.ts`, `src/mobile/AgendaList.tsx` |
| Errors in understandable language | **PASS** | Every speech error mapped to a sentence, in all three languages. `src/mobile/CaptureBar.tsx` — `errorText` |
| No crash when permissions are denied | **PASS** | Denial resolves to a message pointing at Settings; nothing throws. `SpeechPlugin.swift` — `start`; `src/lib/voice/nativeSpeech.ts` |
| Recording interrupted by a call | **FIXED** | No interruption handling existed: a call took the microphone and left the screen on *"Listening"*. Now ends the recording **and keeps what was said**, with a 1.5 s fallback. `SpeechPlugin.swift` — `audioInterrupted`, `finishEarly` |
| Recording interrupted by an audio-route change | **FIXED** | Unplugging headphones changed the input under the audio tap. Now handled the same way. `SpeechPlugin.swift` — `audioRouteChanged` |
| Recording interrupted by backgrounding | **FIXED** | Leaving the app mid-sentence now finishes the note. `src/mobile/CaptureBar.tsx` — `visibilitychange` |
| Recording interrupted by lost connectivity | **FIXED** | An error part-way through discarded everything heard. Now keeps the words. `src/mobile/CaptureBar.tsx` — `onError` |
| Logs do not expose tokens or personal data | **PASS** | No `print` or `NSLog` in any Swift file. Web and server logs record error objects and codes only; the server never logs a transcript or an IP address |
| No private or deprecated API | **FIXED** | `AVAudioSession.recordPermission` / `requestRecordPermission`, deprecated in iOS 17, now use `AVAudioApplication` there and the old calls only below. `SpeechPlugin.swift` — `microphoneState`, `requestMicrophone`. No private API |
| Only required capabilities | **FIXED** | No entitlements at all. Removed `LSApplicationQueriesSchemes` (`msauthv2`, `msauthv3`): nothing calls `canOpenURL`, and its comment wrongly claimed the app used Microsoft Authenticator |

## 2. Microphone and speech recognition

| Requirement | Status | Evidence |
|---|---|---|
| `NSMicrophoneUsageDescription` present and accurate | **FIXED** | Described "tasks", which the product no longer has. Now: *"Hence uses the microphone only while you are recording a voice note, so what you say can be saved as a line on your list."* |
| `NSSpeechRecognitionUsageDescription` present and accurate | **FIXED** | Now: *"Hence turns your voice note into text so it can be saved to your list. Apple processes the audio to transcribe it."* |
| Asked at the moment of use, not at launch | **PASS** | Requested on the first tap of the microphone. `src/lib/voice/nativeSpeech.ts` |
| Works after denial | **PASS** | Typing remains available; the message explains how to re-enable |
| Audio is not recorded or stored by the app | **PASS** | Audio is streamed to Apple's recogniser and never written to disk or sent to the Hence server |
| Vocabulary hints disclosed | **FIXED** | Names of people and projects are sent to Apple's recogniser to spell them correctly; the privacy policy now says so. `src/lib/voice/hints.ts` |
| Permission prompts localised | **MANUAL** (recommended) | The two strings are English only. French and Chinese users see the system prompt in English. Adding `InfoPlist.strings` for `fr` and `zh-Hans` is optional but kinder |

## 3. Privacy

| Requirement | Status | Evidence |
|---|---|---|
| **Permission before sharing with a third-party AI** (Guideline 5.1.2(i)) | **FIXED** | The text of every note went to Anthropic's Claude with no in-app consent — only a paragraph in the privacy policy. The app now asks once, at the first capture, with *Allow* and *Keep it on my iPhone* equally prominent, and a switch in **Settings → Voice notes**. Declining uses on-device reading. A test fails if a declined note attempts any network request. `src/mobile/aiConsent.ts`, `AiConsentSheet.tsx`, `src/lib/voice/analyze.test.ts` |
| Privacy manifest present | **PASS** | `ios/App/App/PrivacyInfo.xcprivacy` |
| Tracking declared | **PASS** | `NSPrivacyTracking` false, no tracking domains |
| Collected data declared | **PASS** | *Other User Content*, not linked to identity, not tracking, *App Functionality* |
| Required-reason APIs declared | **PASS** | UserDefaults `CA92.1` (Capacitor Preferences and `MicrosoftPlugin.swift`), file timestamp `C617.1`, disk space `E174.1` (Filesystem plugin). Capacitor core ships its own manifest |
| Privacy policy accurate | **FIXED** | It described an older app: no mention of the Outlook connection, the vocabulary hints or the in-memory IP rate limit, and it pointed to export features only the web version has. Every claim now checked against the code. `public/privacy.html` |
| Privacy policy reachable in the app | **FIXED** | No link existed. **Settings → About → Privacy policy**, opening in Safari. `src/mobile/SettingsSheet.tsx` — `AboutSection` |
| Privacy policy URL live | **PASS** | `https://tasks-production-2a6e.up.railway.app/privacy` returns 200 |
| App Tracking Transparency | **N/A** | No tracking, no advertising identifier |
| App Privacy answers in App Store Connect | **MANUAL** | Data collected: **Yes**. *User Content → Other User Content*: purpose **App Functionality**; **not linked** to the user; **not used for tracking**. Nothing else is collected |

## 4. Accounts and sign-in

| Requirement | Status | Evidence |
|---|---|---|
| In-app account deletion (5.1.1(v)) | **N/A** | The app has no accounts of its own |
| Sign in with Apple (4.8) | **N/A** | Microsoft sign-in connects a calendar; it is not a way to log in to the app, which works fully without it |
| Microsoft sign-in is secure | **PASS** | Apple's `ASWebAuthenticationSession`; PKCE with no client secret in the app; `state` verified; refresh token in the Keychain as `AfterFirstUnlockThisDeviceOnly`; disconnecting removes the token and the cached agenda. `MicrosoftPlugin.swift` |
| Scopes are minimal | **PASS** | `Calendars.ReadWrite offline_access User.Read` — no mail or files |
| Reviewer can use the core app | **PASS** | Capture, list, reminders, email and share all work without any sign-in |

## 5. Notifications, calendar, email

| Requirement | Status | Evidence |
|---|---|---|
| Notifications requested in context | **PASS** | Asked when a reminder is first set, not at launch. `src/lib/native/notifications.ts` — `ensureNotificationPermission` |
| No push entitlement needed | **N/A** | Local notifications only |
| Calendar permission | **N/A** | EventKit is not used, so no `NSCalendarsUsageDescription` is needed. Events go through Microsoft Graph when connected, otherwise a calendar file through the share sheet |
| Email | **PASS** | `mailto:` opens the person's own mail app; the app sends nothing |

## 6. Accessibility

| Requirement | Status | Evidence |
|---|---|---|
| Controls have spoken labels | **FIXED** | The view tabs were announced as **"Settings"**; every checkbox was read in English whatever the language; the working indicator said "Working". All corrected in three languages |
| Switch and tabs expose their state | **PASS** | `role="switch"` with `aria-checked`; `role="tab"` with `aria-selected` |
| Touch targets | **PASS** | Primary controls 44–70 pt |
| Dynamic Type | **MANUAL** (known limitation) | Text sizes are fixed in the web layer and do not follow the system text size. Not a rejection reason, but worth doing |
| Contrast | **MANUAL** (known limitation) | The faintest grey on graphite measures about 3:1, below the 4.5:1 guideline for small text. Left unchanged to preserve the design; used only for secondary labels |

## 7. Export compliance and content

| Requirement | Status | Evidence |
|---|---|---|
| Encryption declaration | **PASS** | `ITSAppUsesNonExemptEncryption` false: standard HTTPS only |
| Age rating | **MANUAL** | 4+ is appropriate: no user-generated content shared with others, no web browsing, no objectionable material |
| Name consistency | **MANUAL** (decide) | The store record is **iHence**; the home screen shows **Hence**. Allowed, but reviewers sometimes question it. Align them, or keep and expect a possible question |

## 8. App Review notes (draft to paste)

> Hence is a voice note app. Tap the microphone, speak, and the note appears as one line.
> Tap a line to turn it into a reminder, an email or a calendar event.
>
> **No account is required.** Every core feature can be reviewed without signing in.
>
> The first recording asks whether notes may be sent to Anthropic's Claude to be tidied up.
> Either answer works: declining reads notes on the device.
>
> **Optional:** the Agenda tab and direct calendar events need a Microsoft 365 or Outlook
> account, connected in Settings → Calendar. Without one, the Agenda tab explains how to
> connect, and *Add to calendar* uses the share sheet instead. *[If providing a test
> account: add its address and password here.]*
>
> Speech recognition uses Apple's `SFSpeechRecognizer` and needs a network connection.

## 9. Open question

**The week agenda may be showing only today and tomorrow.** It asks the calendar for seven
days; if that request fails, the app falls back to a copy saved by an older build that held
two. On the phone: scroll to the bottom of the Agenda. A grey *"Offline · as of …"* line means
the request is failing and there is a defect to fix; no line means there are simply no
meetings later in the week.

---

## Commands run

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc -b --force`) | exit 0, no errors |
| `npm test` (vitest) | **10 files, 59 tests passed** |
| `npm run build` | exit 0, no errors or warnings |
| CI *iOS compiles (unsigned)*, `xcodebuild` on macOS | **success**, run #50, commit `e5a995b` |
| Swift string-interpolation scan (all 5 Swift files) | 13 intact, 0 lost |
| `Info.plist` structure check | 33 keys, no duplicates, 0 problems |
| Translation coverage | 104 strings, complete in English, French and Chinese |
| `GET /healthz`, `/privacy`, `/support` on the production server | 200, 200, 200 |

## Deliberately not done

No build was uploaded or submitted, no certificate or provisioning profile was changed, and
the bundle identifier was left as it is. The next release build is yours to start.
