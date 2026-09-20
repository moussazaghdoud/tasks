import PDFDocument from 'pdfkit';
import fs from 'node:fs';

const OUT = process.argv[2];

const INK = '#15191b';
const BODY = '#33393c';
const MUTED = '#71787c';
const ACCENT = '#0e5f5b';
const RULE = '#dcdfe0';
const CODE_BG = '#f4f5f4';
const NOTE_BG = '#eef4f2';
const WARN_BG = '#fbf0ea';
const WARN_INK = '#9c4322';

const doc = new PDFDocument({ size: 'A4', margin: 58, bufferPages: true, info: {
  Title: 'Hence — Deploy Your Own',
  Author: 'Hence',
  Subject: 'Setting up a voice-first capture app: clone to TestFlight, from Windows, without a Mac.',
} });
doc.pipe(fs.createWriteStream(OUT));

const L = doc.page.margins.left;
const R = doc.page.width - doc.page.margins.right;
const W = R - L;
const BOTTOM = doc.page.height - doc.page.margins.bottom;

const ensure = (h) => {
  if (doc.y + h > BOTTOM) doc.addPage();
};

const h1 = (text, kicker) => {
  doc.addPage();
  if (kicker) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT)
      .text(kicker.toUpperCase(), L, doc.y, { characterSpacing: 1.6 });
    doc.moveDown(0.35);
  }
  doc.font('Helvetica-Bold').fontSize(19).fillColor(INK).text(text, L, doc.y, { width: W });
  doc.moveDown(0.15);
  doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(1).strokeColor(RULE).stroke();
  doc.moveDown(0.8);
};

const h2 = (text) => {
  ensure(58);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(12.5).fillColor(INK).text(text, L, doc.y, { width: W });
  doc.moveDown(0.3);
};

const p = (text, opts = {}) => {
  const size = opts.size ?? 10;
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(opts.color ?? BODY);
  const h = doc.heightOfString(text, { width: W, lineGap: 2.4 });
  ensure(h + 6);
  doc.text(text, L, doc.y, { width: W, lineGap: 2.4 });
  doc.moveDown(0.45);
};

const bullets = (items) => {
  doc.font('Helvetica').fontSize(10).fillColor(BODY);
  for (const item of items) {
    const h = doc.heightOfString(item, { width: W - 16, lineGap: 2.4 });
    ensure(h + 4);
    const y = doc.y;
    doc.circle(L + 3.2, y + 4.8, 1.6).fillColor(ACCENT).fill();
    doc.fillColor(BODY).text(item, L + 14, y, { width: W - 16, lineGap: 2.4 });
    doc.moveDown(0.25);
  }
  doc.moveDown(0.3);
};

const steps = (items) => {
  let n = 1;
  for (const item of items) {
    doc.font('Helvetica').fontSize(10).fillColor(BODY);
    const h = doc.heightOfString(item, { width: W - 22, lineGap: 2.4 });
    ensure(h + 6);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ACCENT).text(String(n) + '.', L, y + 0.5, { width: 16 });
    doc.font('Helvetica').fontSize(10).fillColor(BODY).text(item, L + 20, y, { width: W - 22, lineGap: 2.4 });
    doc.moveDown(0.35);
    n++;
  }
  doc.moveDown(0.25);
};

const code = (lines) => {
  const text = Array.isArray(lines) ? lines.join('\n') : lines;
  doc.font('Courier').fontSize(8.8);
  const inner = W - 28;
  const h = doc.heightOfString(text, { width: inner, lineGap: 2.2 }) + 18;
  ensure(h + 8);
  const y = doc.y;
  doc.roundedRect(L, y, W, h, 4).fillColor(CODE_BG).fill();
  doc.rect(L, y, 2.5, h).fillColor(ACCENT).fill();
  doc.fillColor('#22282a').font('Courier').fontSize(8.8)
    .text(text, L + 16, y + 9, { width: inner, lineGap: 2.2 });
  doc.y = y + h;
  doc.moveDown(0.6);
};

const box = (label, text, kind = 'note') => {
  const bg = kind === 'warn' ? WARN_BG : NOTE_BG;
  const ink = kind === 'warn' ? WARN_INK : ACCENT;
  doc.font('Helvetica').fontSize(9.3);
  const inner = W - 28;
  const labelH = 13;
  const h = doc.heightOfString(text, { width: inner, lineGap: 2.2 }) + labelH + 18;
  ensure(h + 8);
  const y = doc.y;
  doc.roundedRect(L, y, W, h, 4).fillColor(bg).fill();
  doc.font('Helvetica-Bold').fontSize(8.2).fillColor(ink)
    .text(label.toUpperCase(), L + 14, y + 9, { width: inner, characterSpacing: 1.2 });
  doc.font('Helvetica').fontSize(9.3).fillColor(kind === 'warn' ? '#6d3720' : '#1f3f3d')
    .text(text, L + 14, y + 9 + labelH, { width: inner, lineGap: 2.2 });
  doc.y = y + h;
  doc.moveDown(0.6);
};

const table = (head, rows, widths) => {
  const total = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => (w / total) * W);
  const pad = 7;

  const rowHeight = (cells, font, size) => {
    doc.font(font).fontSize(size);
    return Math.max(...cells.map((c, i) => doc.heightOfString(String(c), { width: cols[i] - pad * 2, lineGap: 1.8 }))) + pad * 2;
  };

  const drawRow = (cells, { header = false } = {}) => {
    const font = header ? 'Helvetica-Bold' : 'Helvetica';
    const size = header ? 9 : 9.2;
    const h = rowHeight(cells, font, size);
    ensure(h + 2);
    const y = doc.y;
    if (header) doc.rect(L, y, W, h).fillColor('#f0f2f1').fill();
    let x = L;
    cells.forEach((cell, i) => {
      doc.font(font).fontSize(size).fillColor(header ? INK : BODY)
        .text(String(cell), x + pad, y + pad, { width: cols[i] - pad * 2, lineGap: 1.8 });
      x += cols[i];
    });
    doc.moveTo(L, y + h).lineTo(R, y + h).lineWidth(0.6).strokeColor(RULE).stroke();
    doc.y = y + h;
  };

  ensure(70);
  drawRow(head, { header: true });
  rows.forEach((r) => drawRow(r));
  doc.moveDown(0.8);
};

/* ------------------------------------------------------------------ */
/* Title page                                                          */
/* ------------------------------------------------------------------ */

doc.y = 190;
doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT)
  .text('SELF-HOSTING GUIDE', L, doc.y, { characterSpacing: 1.8 });
doc.moveDown(0.8);
doc.font('Helvetica-Bold').fontSize(34).fillColor(INK).text('Deploy your own', L, doc.y, { width: W });
doc.font('Helvetica-Bold').fontSize(34).fillColor(ACCENT).text('voice capture app', L, doc.y, { width: W });
doc.moveDown(0.9);
doc.font('Helvetica').fontSize(12.5).fillColor(BODY)
  .text('From an empty folder to an app on your iPhone — on a Windows PC, without owning a Mac.', L, doc.y, { width: W - 90, lineGap: 3 });

doc.moveDown(1.6);
doc.moveTo(L, doc.y).lineTo(L + 70, doc.y).lineWidth(2.5).strokeColor(ACCENT).stroke();
doc.moveDown(1.2);

doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
  .text('Roughly 90 minutes of setup, most of it waiting for Apple.\nEverything after that is one click.', L, doc.y, { width: W, lineGap: 3 });

doc.y = doc.page.height - 130;
doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
  .text('You will need: a GitHub account, a credit card for Apple ($99/year), and an Anthropic API key.', L, doc.y, { width: W });

/* ------------------------------------------------------------------ */

h1('What you are building', 'Overview');

p('This app catches a thought the moment you have one. You tap a microphone, say a sentence, and it becomes one clean line on a list. No forms, no categories, no decisions at the moment of capture.');

p('Three separate things make that work, and you will set up each one:');

table(
  ['Piece', 'What it does', 'Where it runs'],
  [
    ['The app', 'The screens on your iPhone. Records your voice, keeps your thoughts, reminds you.', 'Your phone'],
    ['The server', 'Turns a rambling transcript into a clean thought, using Claude.', 'Railway'],
    ['The build pipeline', 'Compiles the iOS app, signs it, uploads it to Apple.', 'GitHub Actions'],
  ],
  [22, 48, 30],
);

h2('How your voice becomes a thought');

code([
  'You speak                    "um remind me tomorrow morning to ask',
  '                              terry about the bosch intro"',
  '        |',
  '        v',
  "Apple's speech engine        transcribes it (on Apple's servers)",
  '        |',
  '        v',
  'Your server + Claude         reads it, fixes the name, resolves the date',
  '        |',
  '        v',
  'Your list                    "Ask Thierry about the Bosch intro"',
  '                              reminder set for 09:00 tomorrow',
]);

p('The important part: Claude sees your people and projects, so it corrects "terry" to "Thierry" and knows what "tomorrow morning" means. Without it, the app falls back to simple on-device parsing and your notes stay messy.');

h2('What it costs');

table(
  ['Item', 'Cost', 'Required?'],
  [
    ['Apple Developer Program', '$99 / year', 'Yes, for any app on an iPhone'],
    ['Anthropic API', 'Pay per use — pennies a day for personal use', 'Optional, but it is the whole point'],
    ['Railway', 'Free tier is enough to start', 'Yes, to reach Claude'],
    ['GitHub Actions', 'Free for public repositories', 'Yes'],
  ],
  [34, 36, 30],
);

box('One honest warning', 'GitHub gives free macOS build minutes to public repositories only. If your repository is private, a release build costs roughly a dollar. Nothing else here has a surprise bill.');

/* ------------------------------------------------------------------ */

h1('The code on your machine', 'Part 1');

p('You need Node 22 or newer and Git. Check with:');
code(['node --version', 'git --version']);

p('Then get the code and start it:');
code([
  'git clone https://github.com/<your-account>/tasks.git',
  'cd tasks',
  'npm ci',
  'npm run dev',
]);

p('Open the address it prints. You will see the desktop version. To see the phone app, narrow your browser window to under 768 pixels wide — the layout switches to the iPhone design, dark theme and all.');

box('Why npm ci and not npm install', 'npm ci installs the exact versions recorded in package-lock.json. The build pipeline uses the same command, so what you test locally is what ships. If you ever see a build fail immediately on the server, an out-of-date lockfile is the first thing to check — commit it whenever you add a dependency.');

h2('Make it your own');

p('Before you build anything, change the app identifier. It must be globally unique across the App Store and you cannot change it later without creating a new app.');

p('Edit capacitor.config.ts and replace com.moussazaghdoud.hence with your own reversed domain, for example com.yourname.capture. Then run:');
code(['npx cap sync ios']);

/* ------------------------------------------------------------------ */

h1('A Claude API key', 'Part 2');

steps([
  'Go to console.anthropic.com and sign in.',
  'Open Settings, then API keys.',
  'Create a key and copy it. You only see it once.',
  'Add a small amount of credit — a few dollars lasts a long time for personal use.',
]);

box('Keep this one secret', 'Unlike most values in this guide, an API key is a real credential. It never goes into the app itself, only onto your server. Anything inside an iPhone app can be extracted from the download.', 'warn');

p('To try it locally before deploying, create a file named .env.local in the project root:');
code(['ANTHROPIC_API_KEY=sk-ant-...']);

p('Restart npm run dev, speak something into the browser, and the captured line should come back clean rather than word-for-word.');

/* ------------------------------------------------------------------ */

h1('The server', 'Part 3');

p('The app on your phone cannot call Claude directly — that would put your API key inside the download. Instead it asks a small server that you own.');

steps([
  'Push your copy of the code to your own GitHub repository.',
  'Go to railway.app and sign in with GitHub.',
  'New Project, then Deploy from GitHub repo, and pick your repository.',
  'Open the service, go to Variables, and add ANTHROPIC_API_KEY with the key from Part 2.',
  'Go to Settings, then Networking, and click Generate Domain. Copy the address it gives you.',
]);

box('The mistake that costs an afternoon', 'If your host decides on its own how to build the project, it may conclude this is a plain website, serve the files, and never start the server. Everything looks fine — the page loads — but the part that calls Claude was never running. The repository includes a Dockerfile precisely to prevent that guesswork. Make sure no Output Directory is set in the service settings, and leave the start command empty.', 'warn');

h2('Check it actually works');

p('Open your Railway address in a browser and add /healthz to the end. You want to see exactly this:');
code(['{"ok":true,"voice":true}']);

table(
  ['What you see', 'What it means'],
  [
    ['{"ok":true,"voice":true}', 'Correct. The server is running and can see your Claude key.'],
    ['{"ok":true,"voice":false}', 'The server runs but the key is missing or on the wrong service.'],
    ['A web page instead of text', 'Your host is serving files, not running the server. See the warning above.'],
  ],
  [34, 66],
);

/* ------------------------------------------------------------------ */

h1('The Apple Developer Program', 'Part 4');

p('This is the slow step, so start it early. Everything after it waits on approval.');

steps([
  'Turn on two-factor authentication for the Apple ID you will use. Enrolment refuses to continue without it.',
  'Go to developer.apple.com/programs and click Enrol.',
  'Choose Individual unless the app must be published under a company name. Organization enrolment needs a D-U-N-S number and takes one to three weeks; Individual is usually approved within a day.',
  'Pay the $99. Approval arrives by email.',
]);

box('Use an Apple ID you will keep', 'The account owns the app. Moving an app to a different Apple ID later is a support request, not a setting.');

p('Once approved, note your Team ID: developer.apple.com/account, then Membership details. It is ten characters, something like A1B2C3D4E5.');

/* ------------------------------------------------------------------ */

h1('The App Store Connect key', 'Part 5');

p('This key lets the build pipeline talk to Apple on your behalf, so you never sign anything by hand.');

steps([
  'Go to appstoreconnect.apple.com, then Users and Access, then Integrations.',
  'Choose App Store Connect API, then Team Keys, then the plus button.',
  'Name it CI and give it the App Manager role.',
  'Download the .p8 file. You get exactly one chance to download it.',
  'Note the Key ID next to it, and the Issuer ID shown above the table.',
]);

p('If your Apple account is in French, the same path reads: Utilisateurs et accès, Intégrations, API App Store Connect, Clés d’équipe, and the role is Responsable d’app.');

h2('Turn the key file into one line');

p('GitHub stores secrets as text, so the .p8 file has to be encoded. In PowerShell, from the folder where you saved it:');
code([
  '[Convert]::ToBase64String(',
  '  [IO.File]::ReadAllBytes("AuthKey_ABCD1234.p8")',
  ') | Set-Clipboard',
]);
p('That puts one long line on your clipboard. Paste it straight into GitHub in Part 7.');

/* ------------------------------------------------------------------ */

h1('The certificates repository', 'Part 6');

p('Signing an iOS app needs a certificate. Rather than generating one by hand on a Mac you do not have, the pipeline creates it once and stores it encrypted in a private repository of yours.');

steps([
  'On GitHub, create a new repository named something like app-certificates. Make it Private. Leave it empty.',
  'Go to Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens.',
  'Create a token with access to only that one repository, and give it the Contents: Read and write permission.',
  'Copy the token.',
]);

p('Now encode your username and token together, again in PowerShell:');
code([
  '[Convert]::ToBase64String(',
  '  [Text.Encoding]::UTF8.GetBytes("yourusername:github_pat_xxx")',
  ') | Set-Clipboard',
]);

box('Invent a passphrase now', 'You will need a MATCH_PASSWORD in the next part. It encrypts your certificates. Save it in your password manager before you continue — if you lose it, you have to delete the certificates and start this part again.', 'warn');

/* ------------------------------------------------------------------ */

h1('Secrets and variables', 'Part 7');

p('In your main repository: Settings, then Secrets and variables, then Actions.');

h2('Secrets tab');

table(
  ['Name', 'Value'],
  [
    ['ASC_KEY_ID', 'The Key ID from Part 5'],
    ['ASC_ISSUER_ID', 'The Issuer ID from Part 5'],
    ['ASC_KEY_P8', 'The long base64 line from Part 5'],
    ['APPLE_TEAM_ID', 'Your ten-character Team ID'],
    ['MATCH_GIT_URL', 'https://github.com/<you>/app-certificates.git'],
    ['MATCH_GIT_BASIC_AUTHORIZATION', 'The base64 username:token from Part 6'],
    ['MATCH_PASSWORD', 'The passphrase you invented'],
  ],
  [38, 62],
);

h2('Variables tab');

table(
  ['Name', 'Value'],
  [
    ['API_BASE_URL', 'Your Railway address, including https://'],
    ['APP_NAME', 'The name of your app, if not Hence'],
    ['APP_IDENTIFIER', 'Your bundle identifier, if you changed it'],
  ],
  [38, 62],
);

box('Include the https://', 'A bare address like myapp.up.railway.app is read as a folder name rather than a website, so the app quietly falls back to on-device analysis and looks like the AI simply is not very good. The code now repairs this, but type it correctly anyway.', 'warn');

box('Secrets are read when a run starts', 'If you start a build and then add a missing secret, that run still fails. Start a new one.');

/* ------------------------------------------------------------------ */

h1('The App ID and the app record', 'Part 8');

p('Two things must exist on Apple’s side before a build can be uploaded. One is automated; the other is not.');

h2('Register the App ID');

p('In your repository: Actions, then iOS release, then Run workflow, and choose bootstrap. This registers your bundle identifier with Apple. It takes under a minute.');

h2('Create the app record by hand');

p('Apple’s API cannot create an app record. There is no endpoint for it, with any key or any role. This step is done once in a browser and cannot be automated.');

steps([
  'Go to appstoreconnect.apple.com/apps and click the plus button, then New App.',
  'Platform: iOS.',
  'Name: your app name. It must be unique across the entire App Store, so have a second choice ready.',
  'Primary Language: whatever you prefer.',
  'Bundle ID: pick yours from the list. If it is not there, the bootstrap step above did not finish.',
  'SKU: any unique string, for example capture-001. Nobody sees it.',
  'User Access: Full Access, then Create.',
]);

/* ------------------------------------------------------------------ */

h1('Your first build', 'Part 9');

p('Actions, then iOS release, then Run workflow, leaving the lane on beta.');

p('Six to fifteen minutes. On the first run the pipeline also creates your distribution certificate and stores it in the private repository from Part 6; later runs reuse it.');

p('What happens, in order:');
bullets([
  'The web app is built, with your Railway address baked in.',
  'It is copied into the iOS project.',
  'The certificate and provisioning profile are fetched, or created the first time.',
  'Xcode archives and signs the app on a rented Mac.',
  'The result is uploaded to TestFlight.',
]);

box('The version and build number', 'The version shown to users comes from package.json. The build number is the workflow run number, so it always increases and always points back at a specific run. Apple rejects a build number it has seen before, so never re-run an old workflow — start a new one.');

/* ------------------------------------------------------------------ */

h1('On your iPhone', 'Part 10');

steps([
  'In App Store Connect, open your app and go to the TestFlight tab.',
  'The build shows as Processing for five to fifteen minutes. Wait for it to become a version number.',
  'If you see Missing Compliance, click it and answer No to the encryption question. The app uses only standard HTTPS.',
  'Under Internal Testing, create a group, add yourself, and select the build. Tick automatic distribution so future builds arrive on their own.',
  'On the phone, install TestFlight from the App Store, sign in with the same Apple ID, and your app is there.',
]);

h2('Check it end to end');

p('Tap the microphone and say something deliberately messy, with a name and a vague time in it:');
code(['"um remind me tomorrow morning to ask terry about the bosch intro"']);

p('You should get back a single clean line, the name spelled correctly, and a reminder set for nine in the morning. The small message at the bottom of the screen tells you which engine read it:');

table(
  ['Message', 'Meaning'],
  [
    ['Captured', 'Claude read it. Everything is connected.'],
    ['Captured · on-device', 'The server was not reachable. Check Part 3 and the API_BASE_URL variable.'],
  ],
  [30, 70],
);

box('Expect two permission prompts', 'The first time you tap the microphone, iOS asks separately for Speech Recognition and for the Microphone. Both are required. If you get no prompt at all and an error instead, the app was built without the speech component — that is a build problem, not a device problem.');

/* ------------------------------------------------------------------ */

h1('Optional: your work calendar', 'Part 11');

p('Turning a thought into a calendar event works out of the box through the share sheet, which needs no setup and no permissions. If you would rather have events created directly in a Microsoft 365 calendar, register the app with your organisation:');

steps([
  'Go to entra.microsoft.com, then App registrations, then New registration.',
  'Name it, and choose the account types that match your organisation.',
  'Under Redirect URI, choose the iOS / macOS platform and enter your bundle identifier. It generates a URI of the form msauth.<your bundle id>://auth.',
  'Under Authentication, set Allow public client flows to Yes.',
  'Under API permissions, add the delegated Microsoft Graph permissions Calendars.ReadWrite and offline_access.',
  'Copy the Application (client) ID and the Directory (tenant) ID into your repository variables.',
]);

box('This may not be yours to decide', 'Large organisations often disable user consent for new applications. If the permission status stays at Not granted and the consent button is greyed out, your IT administrator has to approve it. The share-sheet route keeps working in the meantime.', 'warn');

box('Never put a client secret in the app', 'A phone uses PKCE, which proves the request came from the same app that started it, without storing a secret. If you are reusing a registration built for a server, take only the client ID and tenant ID from it and leave the secret where it is.', 'warn');

/* ------------------------------------------------------------------ */

h1('When something fails', 'Troubleshooting');

p('These are real failures from a real first-time setup, with what each one actually meant.');

table(
  ['What you see', 'What it really is'],
  [
    ['Build fails in under ten seconds', 'It failed before doing any work. Usually the lockfile is missing or out of date, or the host guessed the wrong kind of project.'],
    ['The resource apps does not allow CREATE', 'Apple has no API for creating an app record. Do Part 8 by hand.'],
    ['Could not find option api_key', 'An older tool that authenticates with an Apple ID rather than an API key. The pipeline in this repository does not use it.'],
    ['Info.plist did not contain CFBundleShortVersionString', 'An empty version reached the build. An unset workflow input arrives as an empty string, which is not the same as unset.'],
    ['Missing secret, though you added it', 'Secrets are read when a run starts. Start a new run.'],
    ['POST to your server returns 405', 'Your host is serving files rather than running the server.'],
    ['/healthz returns a web page', 'Same cause as above.'],
    ['Voice fails with no permission prompt', 'Nothing native ran. The speech component is missing from the build, or not registered with the web layer.'],
    ['Notes come out word for word', 'Claude is not being reached. Check /healthz, then the API_BASE_URL variable, including its https://.'],
    ['The keyboard covers the text field', 'The keyboard resize mode is set to body rather than native.'],
  ],
  [33, 67],
);

/* ------------------------------------------------------------------ */

h1('Where your data goes', 'Privacy');

p('Worth knowing, and worth telling anyone you share the app with.');

table(
  ['What', 'Where it goes'],
  [
    ['Your thoughts', 'Stored on your phone only. Deleting the app deletes them. Export before you do.'],
    ['Your voice', "Transcribed by Apple, usually on Apple's servers. It is not stored by this app."],
    ['The transcript', 'Sent to your own server, which forwards it to Anthropic for analysis. Not stored by either.'],
    ['Your Claude API key', 'On your server only. Never inside the app.'],
    ['Reminders', 'Local notifications on the phone. They work with the app closed, and are not synced anywhere.'],
  ],
  [26, 74],
);

h2('What the app deliberately does not do');

bullets([
  'It does not listen in the background. iOS does not permit it, and nothing here pretends otherwise.',
  'It does not sync between devices. Your phone and your laptop each keep their own list.',
  'It has no accounts, no analytics and no tracking.',
  'It requests no camera or photo access, which also keeps App Review simple.',
]);

box('If you publish to the App Store', 'You will be asked about data collection. Answer honestly: the app collects User Content, for App Functionality, not linked to an identity. If you later add accounts or syncing, that answer must change.');

/* ------------------------------------------------------------------ */
/* Footers                                                             */
/* ------------------------------------------------------------------ */

const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  if (i === range.start) continue;
  // Writing below the bottom margin makes pdfkit helpfully start a new page,
  // which would append one blank page per footer. Drop the margin first.
  doc.page.margins.bottom = 0;
  const y = doc.page.height - 42;
  doc.moveTo(L, y - 8).lineTo(R, y - 8).lineWidth(0.6).strokeColor(RULE).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text('Deploy your own voice capture app', L, y, { width: W / 2, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(String(i - range.start + 1), L + W / 2, y, { width: W / 2, align: 'right', lineBreak: false });
}

doc.end();
