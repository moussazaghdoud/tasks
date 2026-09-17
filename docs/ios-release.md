# Shipping the iOS app from Windows

Everything Apple requires macOS for — Xcode, signing, the `.ipa`, the upload —
runs on a macOS machine rented by the minute from GitHub Actions. You work on
Windows, push to GitHub, and press a button.

```
Windows: npm run dev  →  git push  →  GitHub Actions (macOS runner)
                                        ├── builds the web app
                                        ├── copies it into the iOS project
                                        ├── signs it (certificates from your private repo)
                                        ├── produces Hence.ipa
                                        └── uploads it to TestFlight
                                                   ↓
                                        your iPhone, via the TestFlight app
```

## Why GitHub Actions

| | |
|---|---|
| **Chosen** | **GitHub Actions, macOS runner** — the code is already on GitHub, secrets live there, and macOS runners are **free for public repositories**. Capacitor 8 uses Swift Package Manager, so no CocoaPods step is needed. |
| Codemagic | The best alternative and the one to switch to if this repo becomes private: 500 free macOS minutes/month, Capacitor-aware. |
| Bitrise | Capable, but a heavier setup for one app. |
| Ionic Appflow | Native builds sit in an expensive tier; not worth it for a single app. |

**Costs.** Public repo: GitHub-hosted runners are free (fair-use limits apply).
Private repo: macOS minutes bill at roughly 10× Linux — on the order of
$0.08/minute at the time of writing, so a ~15-minute release is about $1.20,
against 2,000 free minutes/month on the Free plan (which macOS consumes 10× as
fast). Check current pricing before relying on those numbers. The Apple
Developer Program is **$99/year** and is unavoidable for TestFlight or the App
Store.

---

## One-time setup (about 30 minutes, all in a browser)

### 1. Join the Apple Developer Program
[developer.apple.com/programs](https://developer.apple.com/programs/) → **Enroll**.
$99/year (about €99 + VAT in France), renewed automatically. Everything below
waits on this — a free Apple account cannot use TestFlight or the App Store.

Before you start:
- Turn on **two-factor authentication** for the Apple ID you'll use. Enrollment
  refuses to continue without it.
- Use an Apple ID you will keep for years. The account owns the app, and moving
  an app to another account later is a support request, not a setting.

**Choose the entity type carefully — it's awkward to change:**

| | Individual / Sole Proprietor | Organization |
|---|---|---|
| Seller name on the App Store | Your personal name | Your company name |
| Needs | An ID document | A **D-U-N-S number** and proof the company exists |
| Time | Usually 24–48 h | Often 1–3 weeks |

Start as **Individual** unless the app must be published under a company name.

The fastest route is the **Apple Developer app** on your iPhone: it verifies
your identity with the camera and Face ID, and usually approves within a day.
The web form works too, but asks for the same documents.

You'll get an email when the account is active. Until then, nothing else in
this guide can be done.

### 2. Create an App Store Connect API key
[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Users and
Access** → **Integrations** → **App Store Connect API** → **Team Keys** → **+**

- Name: `CI`, Access: **App Manager**
- Download the `.p8` file — **you only get one chance**
- Note the **Key ID** and the **Issuer ID** (shown above the table)

Also note your **Team ID**: [developer.apple.com/account](https://developer.apple.com/account)
→ Membership details.

**If your Apple account is in French**, the same path reads:

| English | French |
|---|---|
| Users and Access | **Utilisateurs et accès** |
| Integrations (tab) | **Intégrations** |
| App Store Connect API | **API App Store Connect** |
| Team Keys | **Clés d'équipe** |
| Access: App Manager | Accès : **Responsable d'app** |
| Issuer ID | **ID d'émetteur** (above the table) |
| Membership details → Team ID | **Adhésion** → **ID d'équipe** |

### 3. Create a private repository for the signing certificates
GitHub → **New repository** → name it `hence-certificates` → **Private** → Create.
It stays empty; `match` fills it with your encrypted certificate and profile.

Then create a token so the build can read it:
**Settings → Developer settings → Personal access tokens → Fine-grained tokens**
→ repository access: only `hence-certificates` → permission **Contents: Read and
write** → generate and copy it.

### 4. Turn two values into the format the secrets need
In PowerShell, from the folder where you saved the `.p8`:

```powershell
# ASC_KEY_P8 — the key file as one line of base64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_ABCD1234.p8")) | Set-Clipboard

# MATCH_GIT_BASIC_AUTHORIZATION — your GitHub username and the token above
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("moussazaghdoud:github_pat_xxx")) | Set-Clipboard
```

### 5. Add the secrets to this repository
GitHub → this repo → **Settings → Secrets and variables → Actions**.

**Secrets** (New repository secret):

| Name | Value |
|---|---|
| `ASC_KEY_ID` | Key ID from step 2 |
| `ASC_ISSUER_ID` | Issuer ID from step 2 |
| `ASC_KEY_P8` | The base64 string from step 4 |
| `APPLE_TEAM_ID` | Team ID from step 2 |
| `MATCH_GIT_URL` | `https://github.com/<you>/hence-certificates.git` |
| `MATCH_GIT_BASIC_AUTHORIZATION` | The second base64 string from step 4 |
| `MATCH_PASSWORD` | Invent a strong passphrase — it encrypts the certificates. **Save it in your password manager; losing it means starting the certificates again.** |

**Variables** (the Variables tab):

| Name | Value |
|---|---|
| `API_BASE_URL` | Your Railway URL, e.g. `https://hence-production.up.railway.app` — the app calls it for voice analysis |
| `APP_IDENTIFIER` | Optional. Defaults to `com.moussazaghdoud.hence` |

### 6. Register the App ID, then create the app record

**Actions** → **iOS release** → **Run workflow** → *What to run*: **bootstrap**.
This registers the App ID (`com.moussazaghdoud.hence`) with Apple.

Then create the app record **once, in the browser** — Apple's API has no
endpoint for creating apps, with any key or role, so this step cannot be
automated:

1. [appstoreconnect.apple.com/apps](https://appstoreconnect.apple.com/apps) → **+** → **New App**
2. **Platform:** iOS
3. **Name:** `Hence` — must be unique across the whole App Store
4. **Primary Language:** English (U.S.)
5. **Bundle ID:** pick `com.moussazaghdoud.hence` from the list
6. **SKU:** any unique string, e.g. `hence-001` (never shown to users)
7. **User Access:** Full Access → **Create**

Everything after this is automated: run **bootstrap** again to confirm, or go
straight to the release below.

---

## Releasing to TestFlight

**Actions** → **iOS release** → **Run workflow** → leave *What to run* on
**beta** → optionally write what testers should know → **Run workflow**.

Roughly 12–20 minutes. On the first run `match` creates your distribution
certificate and profile and saves them to the private repo; later runs reuse
them.

Then, in App Store Connect → your app → **TestFlight**: the build appears as
*Processing* for 5–15 minutes. Add yourself under **Internal Testing**, install
**TestFlight** from the App Store on your iPhone, and the build is there.

**Later releases from Windows:** commit, push, run the workflow again. Or tag a
release — `git tag v1.0.1 && git push --tags` — which starts the same build. The
build number is the workflow run number, so it always increases; the version
shown to users comes from `package.json` unless you type one in.

---

## Submitting to the App Store

1. TestFlight first. Apple rejects apps that crash on launch, and you'll catch
   that in five minutes of real use.
2. In App Store Connect → your app → **App Store** tab, fill in: description,
   keywords, support URL, category (Productivity), and **screenshots** —
   6.7" iPhone (1290×2796) is mandatory. Six are ready in
   [`docs/store/`](store/) at exactly that size, rendered from the app. Regenerate
   or retake them on your phone once the Claude key is live, so the review card
   shows the *Claude* badge rather than *On-device*.
3. **App Privacy** — answer honestly for this app:
   - *Does the app collect data?* Yes.
   - **User Content**: the task text and voice transcripts you send to your
     server for analysis, which forwards them to Anthropic. Purpose: **App
     Functionality**. **Not linked** to an identity (the app has no accounts).
   - No tracking, no advertising, no analytics SDKs.
   - If you later add accounts and sync, this section must be updated.
4. **Export compliance**: already declared in `Info.plist`
   (`ITSAppUsesNonExemptEncryption = false`) — standard HTTPS only, so there's
   no annual encryption filing.
5. Select the TestFlight build, submit for review. First review usually takes
   1–3 days.

Common rejection reasons for an app like this: a microphone permission prompt
whose explanation is vague (ours is specific), or no way to use the app if the
user denies the microphone (ours has **Type instead**).

---

## What actually runs on the phone

| Capability | How | Honest limits |
|---|---|---|
| Speech → text | Apple's `SFSpeechRecognizer` via our own Swift plugin (`ios/App/App/SpeechPlugin.swift`) | Needs microphone + speech permission. Audio is transcribed by Apple, usually on their servers. |
| Voice → structured task | Your Railway server calling Claude | Needs a network. Offline it falls back to on-device parsing. |
| Reminders | iOS local notifications | Delivered **even when the app is closed**. They are not synced to other devices. |
| Storage | Capacitor Preferences | On the device only. Deleting the app deletes the tasks. Export first. |
| Haptics, share sheet, clipboard, status bar, splash, keyboard, safe areas | Capacitor plugins | — |
| Background syncing or listening | **Not implemented** | iOS does not let an app listen or sync freely in the background, and nothing here pretends otherwise. |
| Push notifications (from a server) | **Not implemented** | Would need an APNs key and a backend that tracks devices. Local reminders cover the current feature. |
| Camera / photos | **Not implemented** | The app has no attachments yet, so no camera permission is requested — which keeps App Review simpler. |

## If a build fails

The log is in Actions → the failed run. Common first-run causes:

- **Missing secret** — the workflow checks first and names the one that's absent.
- **`match` cannot access the certificates repo** — the token in
  `MATCH_GIT_BASIC_AUTHORIZATION` expired or lacks Contents: write.
- **App ID doesn't exist** — run the **bootstrap** lane (step 6).
- **Apple rejects the build number** — it must increase; the run number handles
  this, but if you re-run an old workflow, start a new run instead.
- **Xcode version too old for App Store** — pin a newer image by adding
  `xcode-select` to the workflow, or switch the runner to a newer `macos-*`
  label.
