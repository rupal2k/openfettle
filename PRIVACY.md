# OpenFettle privacy policy

Applies to the OpenFettle Android app and the OpenFettle web app (version 1.8.0 and later).
OpenFettle is open source (AGPL v3); everything below can be checked in the code.

## The short version

- **Your data stays on your phone.** Workouts, body weight, meals, blood test results,
  end-of-day check-ins, self-check results and settings are stored only on the device. There is no account and no OpenFettle cloud.
- **No analytics, no ads, no tracking.** The app contains no analytics or advertising SDK and
  sends no usage data anywhere.
- **Photos and lab reports are read on the device.** Food photos and blood test reports (PDF,
  scan or photo) are processed by on-device models and never uploaded.

## What is stored, and where

| Data | Where | Leaves the device? |
|---|---|---|
| Workouts, routines, body weight, meals, custom foods, blood test results, settings | App storage on the phone | No (see "Sync" for self-hosted servers) |
| End-of-day check-ins: how you rated your energy and mood, what weighed on you, your notes and plans | App storage on the phone | No (see "Sync") |
| Self-check results (WHO-5, PHQ-9, GAD-7, AUDIT-C, Indian Diabetes Risk Score): which answer you picked for each question, the date, and for the alcohol and diabetes checks whether you answered as a woman or a man. Your waist and age are turned into an answer band; the numbers you type are not kept | App storage on the phone | No (see "Sync") |
| Blood test reports | Only the values you confirm, plus the sample date and your birth year (never the file name or full date of birth) | No |
| Camera photos (food, lab reports) | Copied into memory to be read, then the photo file is deleted | No |
| Downloaded food-recognition model and exercise pictures | App cache, to work offline | No |

Android cloud backup (Google) is turned off for OpenFettle's data. Moving to a new phone with
Android's device-to-device transfer copies it.

## When the app uses the network

The app connects only to these services, and only for the purpose shown. None of them receive
your health data.

| Service | When | What is sent |
|---|---|---|
| Open Food Facts | You search for a food or look up a barcode | The search words or the barcode number |
| jsDelivr (CDN) | Exercise pictures and animations; the food-model runtime | The file being downloaded |
| Hugging Face | You download the on-device food-recognition model | The file being downloaded |
| GitHub | Only if you tap "Check for updates" or turn on "Tell me about new versions" | A request for the latest version number |

These services see your IP address, like any website you visit; their own privacy policies
apply.

Self-checks also link to other websites and apps (findahelpline.com, the American Diabetes
Association risk test, WHO's hearWHO and WHOeyes pages and the questionnaires' sources), and the
Tele-MANAS row opens your phone's dialer. They open only when you tap them, in your browser or
dialer; OpenFettle sends them none of your answers.

## Sharing

- **Backups and plan files** are created only when you tap Export or Share plan, and go only
  where you send them. A backup contains your blood test results, check-ins and self-check results, so keep it private.
- **Error reports** are created only when you tap "Share error report" after a crash. They
  contain the error message and app version, none of your data, and go only where you send them.

## Sync (self-hosted servers only)

The Android app has no sign-in. If you run your own OpenFettle server and sign in to it from the
web app, your data is copied to **your** server so your devices stay in step. It is never sent
to the OpenFettle project or anyone else.

## Permissions (Android)

- **Camera**: only when you take a food or lab-report photo or scan a barcode.
- **Notifications**: only if you turn on the workout-day reminder or the end-of-day check-in reminder, or play Wind down sounds (the playback notification with Pause).
- **Alarms & reminders**: lets the reminder arrive on time; without it, Android may deliver it
  up to an hour late.

## Deleting your data

Delete check-ins one at a time or all at once under Settings → End-of-day check-in, and self-check
results under Settings → Self-checks. A delete is also honoured by sync, so a deleted result doesn't
come back from your other devices. Check-in and self-check screens are kept out of screenshots and the recent-apps preview, like blood tests; your phone’s screen lock is what protects them on a lost phone. Settings → Reset everything deletes all OpenFettle data on the phone, including cached backup files
and photos. Uninstalling the app also removes it. Delete the food model separately under
Settings → On-device food recognition.

## Children

OpenFettle is not designed for children. Calorie targets are calculated only for adults (18+).

## Contact

Questions or concerns: open an issue at https://github.com/rupal2k/openfettle/issues.
