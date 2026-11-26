# Device regression

Drives the **debug app** (`com.rupal2k.openfit.dbg`) on a real Android phone through its WebView
(Chrome DevTools Protocol over adb) and checks `docs/RELEASE-CHECKLIST.md` sections 1–12 plus
Self-checks and Wind down. It complements `../smoke.sh` (CI, emulator) and the unit tests.

## Run

```sh
# once
npm install
# build and install the debug app (from frontend/)
npm run build:mobile && (cd android && ./gradlew assembleDebug) && adb install -r android/app/build/outputs/apk/debug/app-debug.apk
# all default sections (~12 min)
ADB=/path/to/adb node run.mjs
node run.mjs 05 09                       # only sections whose id starts with 05 or 09
node run.mjs --with offline,camera,model # also the sections that change the phone (below)
```

Exactly one phone must be connected and authorised. The report goes to `reports/<time>/report.md`
(with `results.json`, and a screenshot of the app when a section crashed).

## What it touches

- **Only the debug app and its data.** Each section starts from its own fixture
  (`lib/fixtures.mjs`: `fresh`, `trained`, `selfchecks`), so no section depends on another. The
  debug app's data from before the run is saved first and written back at the end.
- **Test files** in `/sdcard/Download/OpenFettleTest`, deleted at the end. The file picker only
  ever taps these: it is searched for the exact `ofreg-*` name, and a result is tapped only when
  every result shown is a test file. The photo picker is never automated.
- **The phone's main profile only.** Package queries pass `--user 0`. System dumps (alarms, audio)
  are filtered on the phone to the debug app's lines before they reach the computer, and crash
  screenshots are taken only while the debug app is on screen.
- **Settings** a section changes (font size in 02; airplane mode and Wi-Fi in 01b) are read first
  and put back in `finally`; the runner checks them again at the end.

Opt-in sections (`--with`):

| needs    | section       | what it does to the phone |
|----------|---------------|---------------------------|
| offline  | 01b-offline   | airplane mode + Wi-Fi off for about a minute (the app's requests use native HTTP, so a WebView-only offline can't test this) |
| camera   | 08c-camera    | revokes then grants the camera permission, taps "Don't allow" in the system dialog, takes one real photo (Choose photo stays a manual check: the photo picker can't be limited to a test image) |
| model    | 08b-model     | downloads the 93 MB food-recognition model |

## How the checks prove things

- Beeps, vibrations, the screen wake lock and toasts are counted **in the page** (`instrument()` in
  `lib/app.mjs` wraps `navigator.vibrate`, `AudioContext.createOscillator`, `navigator.wakeLock`),
  so they show the app's own calls rather than system logs that other apps also write to.
- Screenshots blocked by `FLAG_SECURE` come back black: `contrast()` measures it.
- Waits are conditions (`waitFor`), not fixed sleeps.
- Known console noise that is not a fault is listed in `KNOWN` in `lib/app.mjs`, each with its reason.
