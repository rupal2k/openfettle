# End-of-day check-in: product and technical spec

Status: **approved 2026-11-18** (product owner accepted the recommendations for D1–D5; D6 decided; D7 follows the device proofs in 6.4). Target: OpenFettle 1.8.0 (P0). Working name in the brief was "Evening check-in". Section 2 recommends **End-of-day check-in**, and this document uses that name.

This is a plan. No code has been written. Every file and function cited below was read on 2026-11-18 at app version 1.7.2 (versionCode 21).

---

## 1. Summary, goals, non-goals

**Summary.** The check-in is a short, optional ritual at the end of a workday, about 5 minutes. You look away from the screen and breathe. You name how you feel and rate your energy. You note what weighed on you most and can leave one concern for tomorrow. You choose one offline thing to do tonight, see tomorrow's planned workout, and finish your workday. It lives inside Wind down, with a manual start and one optional reminder. Everything stays on the phone.

**Goals**
- A clear "the workday is over" moment that takes 5 minutes or less and needs no typing.
- Link the end of work to the evening and to tomorrow's training (the week plan). Other check-in apps do not do this.
- Keep the user's trust: on-device only, sensitive data handled like blood tests, honest copy, and no claim that anything is measured.
- Full accessibility (WCAG 2.2 AA) and all 12 languages from day one.

**Non-goals**
- No AI, no suggestions generated from the entries, no "insights" engine.
- No wearables, no HRV or sensor stress readings. Nothing implies measurement. Do not use the names "Body Battery" or "State of Mind".
- No employer or team reporting, no accounts, no sharing.
- **No telemetry or analytics of any kind.** The app promises "No analytics, no ads, no tracking" (`PRIVACY.md`). Any "metric" in this spec is either shown to the user on their own device or learned through moderated tests and voluntary feedback (section 10).
- No meditation library, no courses, no streaks for the check-in, no feed.

---

## 2. Decisions (product owner)

Decided 2026-11-18: **D1–D5 as recommended below** (name "End-of-day check-in"; reminder off by default with Mon–Fri 17:30 offered; the low-mood line with its rule, subject to native-speaker review per language; patience as the optional second scale; check-ins do not count toward the streak). D6 as recommended. D7 is decided by device proof P2.


| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Feature name | Evening check-in / Workday check-in / End-of-day check-in / Shutdown | **End-of-day check-in.** "Evening" is wrong for people whose shift ends at 07:00 or 15:00. "Shutdown" sounds like a device. The Notifications row already uses this wording. Short label in tight places: "Check-in". |
| D2 | Reminder default | Off / on Mon–Fri | **Off.** When the user turns it on, the same screen shows "Mon–Fri at 17:30" as editable chips and a time field, and that is what is saved. Nothing is scheduled without the switch. Weekend days differ by country, so the days must be easy to change. |
| D3 | Gentle low-mood line | None / one line under a rule | **One line, with a rule.** It shows when the user's last 3 check-ins (within 10 days) each have energy ≤ 2, or the emotion `low` or `overwhelmed`. At most once every 14 days, on the closing screen only. Text: *"You've rated your energy very low a few times lately. Talking to someone you trust, or to a doctor or counsellor, can help."* No diagnosis, no hotline list (it can't stay correct in 12 languages and every country), no notification. **Needs sign-off. A native speaker reviews this line in each language.** |
| D4 | Optional second scale | Patience 1–10 / pleasantness 1–10 / none | **Patience (optional, collapsed).** The emotion choice already carries pleasantness (calm vs frustrated), so a pleasantness scale would ask the same thing twice. Patience is a work-relevant signal the emotion list lacks. It is hidden behind "Add patience (optional)" so the default path stays two taps. |
| D5 | Does a check-in count toward the streak? | Yes / no | **No.** `streakWeeks` in `frontend/src/lib/history.js` counts training weeks. Mixing in check-ins would make the streak mean less and turn a calm ritual into a chore. |
| D6 | Show the check-in on Home outside Wind down? | Only inside Wind down / own card | **Inside the Wind down card** (decided placement). Widen `showWindDown` so the card also appears on workdays after the end time (section 4.1). |
| D7 | Action buttons that open the app | Accept that Snooze/Skip open the app / build a native receiver | **Prove on a device first (section 6.4).** If Snooze or Skip brings the app to the front, ship only the "Start" action plus tap-to-open in 1.8.0, and add a native receiver in 1.8.x. |

---

## 3. User flow

### 3.1 Entry points
1. **Reminder** at the user's end time on workdays (mobile only). Tap → app opens on the check-in.
2. **Wind down sheet** (`WindDown` in `frontend/src/sheets.jsx`): the first, primary button is "Start my end-of-day check-in".
3. **Home Wind down card** (`frontend/src/views/Home.jsx`) opens the Wind down sheet as it does today.
4. **Settings → General → End-of-day check-in** row (next to the Wind down row in `frontend/src/views/Settings.jsx`). It opens the check-in settings and history sheet, which has "Start now".

A manual start works on every build (web, self-host, demo, Android). The reminder is Android only in P0.

### 3.2 Steps and time budget

The 5 minutes is a design target, never an enforced wait. Every step has **Next** and **Prefer to skip**. Skip clears that step's answers and moves on. Back (system or header) returns to the previous step with its answers kept.

| Step | Content | Target time | Shortest path |
|---|---|---|---|
| 0. Start | Title and one line. Shows "From last time" (the concern left for tomorrow) and the follow-up "Did it happen? Did it help?" when they apply (3.4). | 15 s | Next |
| 1. Disconnect | "Look away from the screen." Choose **Box breathing (about 1 min)** or **Just breathe naturally (1 min)**. Optional "Play my Wind down sounds". Cues by sound and/or vibration. | 70 s | Skip |
| 2. Check in | Emotion (one chip). Energy 1–10 (tap a number). Optional patience 1–10. | 30 s | Skip |
| 3. Main stressor | One category chip, optional note (≤ 200 chars). Optional "Leave this for tomorrow": one concern plus an optional next step. | 45 s | Skip |
| 4. Tonight | One offline activity as an intention, grouped (quiet / movement / change of attention / connection / rest), recent favourites first, own option. Shows "Tomorrow: Push day" (or rest day) from the week plan. | 30 s | Skip |
| 5. Finish | Button **Finish my workday**. This saves. | 5 s | tap |
| 6. Closing | "Your workday is done." The chosen activity. Optional **Start my Wind down mix with a 30 min sleep timer**. **Close**. Sometimes a single line: a backup nudge, the low-mood line, or "Was this useful?" (never more than one). | 15 s | Close |

Full path is about 3.5 minutes. Shortest path (Skip ×4, Finish, Close) is 6 taps and under 15 s. It still counts as "done today", so no reminder fires.

### 3.3 Saving rule
- Answers live only in the sheet component's React state until **Finish my workday**. That button does the single `update()` call. Answers are not saved step by step.
- A field the user did not choose is **absent** from the entry. It is never set to a default, so energy is never 5 "because the slider started there".
- An entry where everything was skipped is still saved (`{ id, d, at }`). It records that the workday was finished and stops today's reminder.

### 3.4 Carry-over from the previous check-in (shown on step 0)
- **From last time.** The `later` note of the most recent earlier entry, shown if that entry is the latest one before today. It shows once, with **Done with it** / **Keep it for tomorrow** / no answer. "Keep" copies the note into today's draft `later`, so it rolls forward only when the user chooses.
- **Follow-up.** If the most recent earlier entry has an activity and no `outcome`: "Yesterday you planned: Walk. Did it happen?" (Yes / Partly / No). Then, if Yes or Partly: "Did it help?" (Yes / A little / No). Both are optional. The answer is written to **that earlier entry** as `outcome` when Finish is tapped. It is never a separate notification.

### 3.5 Edge cases

| Case | Behaviour |
|---|---|
| Workout in progress (`S.active`) | The Start button is disabled with "Finish or discard your workout first." A tap on the reminder opens Home (which already shows the active workout) and a toast with the same text. `showWindDown` already hides the card mid-workout. |
| Check-in already done today | The start button becomes "Today's check-in is done · Do it again". Redoing replaces today's entry, because the entry id is the date. A `confirmSheet` first: "Replace today's check-in?" |
| Skipped days, weekends, holidays | Nothing is recorded and there is no nagging. History shows only days that have entries. Carry-over uses "latest earlier entry", not "yesterday", so Friday's note shows on Monday. |
| Time zones, DST | `d` = local calendar date when Finish is tapped (`todayISO()` in `frontend/src/lib/format.js`). Reminders are computed as local wall-clock `new Date(y, m, d, hh, mm)` for each date (correct across DST) and recomputed at every app start and resume, so travel is picked up the next time the app opens. |
| Night shift (end after midnight) | P0: the entry gets the date it was saved on. Documented limit (risk R6). |
| Offline | Everything works offline. On self-host builds the entry syncs later through the normal `pushState`. |
| App killed or sheet closed mid-flow | Nothing is saved. Once any answer exists, the sheet is `locked` (swipe can't dismiss it, see `openSheet(..., { locked })` and `lock()` in `frontend/src/store/useUI.js`). A visible **Close** button asks "Leave without saving?" System Back on step 0 closes. |
| Reminder tapped while the check-in is already open | Don't open a second sheet: a module flag `checkinOpen` is checked. |
| 320 px width | Chips wrap (`.chips` with `flexWrap: 'wrap', overflowX: 'visible'`, like the Wind down layer chips). The energy row of 10 numbers wraps to 2 rows of 5 below 360 px. No horizontal scroll. |
| 200% font | Chips grow and wrap. Primary buttons are full width. Step text stays in normal flow (no fixed heights). The breathing countdown is plain text, not a fixed-size circle. |
| Screen reader | Each step has an `h3` heading that gets focus when the step changes. Chip groups are `role="group"` with `aria-labelledby` (pattern from `SavedMixes`). Chips use `aria-pressed`. The breathing phase is announced through one `aria-live="polite"` region, on phase change only (not every second). |
| Reduced motion | No expanding circle. A text countdown ("Breathe in · 3") updated each second. CSS already disables animation globally (`index.css` line 195). |
| No Web Audio, or sound off | Vibration cues only, plus the text countdown. If neither is available, the text countdown and a "Stay on screen" hint. |

---

## 4. Screens (reusing existing components)

General rules: no new visual components beyond one number row. Use `Button`, `Segmented`, `Switch`, `TextField`, `TextArea`, `Row`, `Section` from `frontend/src/components/ui.jsx`, chips `.chip` / `.chip.on` from `frontend/src/index.css`, and the sheet system (`useUI.openSheet`). The layout is one column, calm, with one primary button per screen and muted helper text (`small muted`).

New file: `frontend/src/checkin-sheets.jsx`, the same pattern as `nutrition-sheets.jsx` and `vision-sheets.jsx`. Pure logic goes in a new file, `frontend/src/lib/checkin.js`.

### 4.1 Home and Wind down
- `showWindDown(S, now)` (`history.js`) gains one more condition: today is in `S.checkinPrefs.days` and now ≥ `end` time. Pure, with a test.
- The Home card stays as it is. When a check-in is due today and not done, its subtitle reads "End-of-day check-in" instead of the Wind down subtitle. The tap still opens the Wind down sheet.
- `WindDown` sheet: a new first block above the sound chips holds a primary `Button` "Start my end-of-day check-in" (or "Today's check-in is done · Do it again", `variant="tinted"`). The mixer below stays unchanged.

### 4.2 Step 0: Start
`h3` "End-of-day check-in". Muted line: "A few minutes to close your workday. Every step is optional." Optional "From last time" card (`.card`, with the concern and next step as text and two `Button size="sm"`). Optional follow-up as two `Segmented` rows using `noneOk` (nothing preselected). Primary **Next**. Plain **Close**.

### 4.3 Step 1: Disconnect
- Line: "Look away from the screen. Sound or vibration will guide you."
- `Segmented` with `noneOk` and no default: "Box breathing" / "Breathe naturally". Choosing one shows **Begin**.
- Box breathing is 4 s in, 4 s hold, 4 s out, 4 s hold, × 4 = 64 s. Natural is a 60 s quiet pause with a cue at start and end.
- While it runs, the screen dims to near black (the theme background, text at low contrast but still AA for the countdown), the text shows the phase and seconds, and a **Stop** button is visible.
- `Switch` labelled "Play my Wind down sounds" (shown only if `S.winddown.mix` exists). It starts the saved mix through `noisePlayer()`.
- **Prefer to skip** / **Next**.

### 4.4 Step 2: Check in
- Label "How do you feel right now?". 8 chips in a wrapping group: Calm, Content, Worried, Frustrated, Overwhelmed, Feeling low, Unsure, Something else. Single select. Tapping the selected chip clears it.
- Label "How much energy do you have left?" with the helper "How you rate yourself, not a measurement." Then a **number row**: 10 buttons 1–10, each `.chip` with `aria-pressed`, inside a `role="group"`. The ends are labelled below the row in two muted lines, left "1 · very little energy left" and right "10 · plenty of energy left". Tapping the selected number clears it.
  - Why not `Slider`: the `Slider` in `ui.jsx` always renders a value (`aria-valuenow`) and a knob position, so it can't show "not chosen". The number row is the tap-a-number alternative the brief asks for. It also meets WCAG 2.5.7 (dragging movements) without needing a second control. A slider is not used in P0.
  - Target size: each number button is at least 40×40 px (the chips' `min-height:40px`). Below 360 px the row wraps into 2×5.
- `Button variant="plain"` "Add patience (optional)" reveals the same number row with the ends "1 · very little patience left" / "10 · plenty of patience left".
- **Prefer to skip** / **Next**.

### 4.5 Step 3: Main stressor
- "What weighed on you most today?" 10 chips: Workload, Deadlines, Clients or customers, Team, Interruptions, Unclear priorities, Technical blockers, Personal, Nothing specific, Something else.
- `TextArea` (optional, `maxLength={200}`, with a live counter "{0} of 200"), placeholder "A few words, if you like. No names needed." The no-names guidance sits in the placeholder and the helper. Nothing is checked or blocked automatically.
- `Button variant="plain"` "Leave something for tomorrow" reveals `TextField` "What can wait until tomorrow?" (≤ 200) and `TextField` "First step tomorrow (optional)" (≤ 200).
- **Prefer to skip** / **Next**.

### 4.6 Step 4: Tonight
- "What will you do after work tonight?" with the helper "Pick one. It's a plan, not a task to tick off."
- **Recent** chip row first (up to 4 most used activity codes from the last 30 entries, computed and not stored). Then five labelled groups, each a wrapping chip group:

| Group code | Activities (code → English) |
|---|---|
| `quiet` | `read` Read · `music` Listen to music · `journal` Write in a journal · `sit` Sit quietly |
| `move` | `walk` Go for a walk · `stretch` Stretch · `cycle` Ride a bike · `yoga` Yoga |
| `attention` | `cook` Cook something · `hobby` A hobby · `puzzle` A game or puzzle · `tidy` Tidy up |
| `connect` | `call` Call someone · `people` Time with family or friends · `pet` Time with a pet |
| `rest` | `bath` A bath or shower · `early` An early night · `nothing` Do nothing for a while |

- "Something else…" chip → `TextField` (≤ 40 chars).
- Below that is a muted card: "Tomorrow: {0}", the routine name from `effectiveRoutine(S, isoOf(tomorrow))` (`history.js`), or "Tomorrow: rest day" when the plan has routines but none tomorrow. It is hidden when there are no routines. It is information only and needs no action.
- **Prefer to skip** / **Finish my workday** (primary, the save).

### 4.7 Step 6: Closing
- `h3` "Your workday is done." If an activity was chosen: "Tonight: {0}."
- If `S.winddown.mix` exists: `Button variant="tinted"` "Start my Wind down mix with a 30 min sleep timer". It calls `askNotifications()`, `noisePlayer().restore(S.winddown)`, `setSleep(30)`, `play()`, the same order as the Wind down Play button. `keepWindDown` and `bridgeWindDown` in `sheets.jsx` must be exported for this.
- One optional line, in priority order: low-mood line (D3) > backup nudge (4.9) > "Was this useful?" (section 10).
- Primary **Close** closes the sheet and goes back to where the user was. No next step, no feed.

### 4.8 Settings
- **General → End-of-day check-in** `Row` (icon `moon` or `check`, chevron) opens the **check-in sheet**:
  - `Section` "Your workday": day chips Mo–Su (`DAYS` from `format.js`, multi-select), `input type="time" className="timef"` "Usual end time", like the reminder time field.
  - `Section` "Breathing cues": `Segmented` Sound and vibration / Sound / Vibration / None.
  - `Button` "Start now".
  - `Section` "Your check-ins": a dated list (newest first) of `Row`s with title `fmtDate(d)` and subtitle e.g. "Calm · energy 6 · Workload". Tap → a detail sheet with every saved field and a **Delete** button. At the bottom: **Delete all check-ins** (danger, `confirmSheet`).
  - Footer: "Check-ins stay on this phone. They are included in Export backup."
- **Notifications** (`MobileReminderCard`): a new `Row` "End-of-day check-in" with a `Switch`. On first switch-on it shows the days and time (D2) in the same card and asks for the notification permission interactively, the same flow as `toggle()` for the workout reminder. Footer: "One reminder at your end time on workdays. Not sent once you've checked in."

### 4.9 Backup nudge
Shown on the closing screen at most once per calendar month, when the user has ≥ 5 check-ins: "Your check-ins exist only on this phone. Back them up now and then: Settings → Export backup." There is no button to Settings, so the user isn't pulled out of the calm screen. The month is stored in `checkinPrefs.nudged` (`'YYYY-MM'`).

---

## 5. Data model

All values are stored as **codes**, never translated text. Labels come from maps of literal `t('…')` calls (the coverage test only finds literal keys, see `soundName` in `sheets.jsx`).

### 5.1 `S.checkins`: array, oldest first

| Field | Type / codes | Rule |
|---|---|---|
| `id` | string, equals `d` | One per day. Redo replaces. `byId` merge works on it. |
| `d` | `'YYYY-MM-DD'` | Local date when saved. Must parse as a real date. |
| `at` | number (ms) | Time saved. Finite, > 0. |
| `breath` | `'box' \| 'natural'` | Only when the user started an exercise. |
| `mood` | `'calm' \| 'content' \| 'worried' \| 'frustrated' \| 'overwhelmed' \| 'low' \| 'unsure' \| 'other'` | optional |
| `energy` | integer 1–10 | optional |
| `patience` | integer 1–10 | optional |
| `stress` | `'workload' \| 'deadlines' \| 'clients' \| 'team' \| 'interruptions' \| 'priorities' \| 'blockers' \| 'personal' \| 'none' \| 'other'` | optional |
| `note` | string ≤ 200 | optional, trimmed, empty → absent |
| `later` | `{ concern: string ≤ 200, next?: string ≤ 200 }` | optional. Dropped if `concern` is empty. |
| `act` | activity code from 4.6, or `'own'` | optional |
| `actOwn` | string ≤ 40 | only with `act: 'own'` |
| `outcome` | `{ happened: 'yes'\|'partly'\|'no', helped?: 'yes'\|'little'\|'no' }` | written at the next check-in. `helped` only if `happened` ≠ `no`. |
| `useful` | `'yes' \| 'no'` | answer to "Was this useful?", optional |

Size: typical entry about 150 B, worst case about 900 B. **Cap: 1000 entries** (about 4 years of workdays, ≤ 0.9 MB worst case, well under the 5 MB `MAX_BODY` in `api/server.js` together with years of workouts). The cleaner keeps the newest 1000. History shows "Showing your last 1000 check-ins" if the cap is ever hit.

### 5.2 `S.checkinPrefs`

| Field | Type | Default (in `DEF`) |
|---|---|---|
| `days` | array of `getDay()` numbers 0–6, unique, sorted | `[1,2,3,4,5]` (shown before the user turns the reminder on, D2) |
| `end` | `'HH:MM'` 24 h | `'17:30'` |
| `remind` | boolean | `false` |
| `cue` | `'both' \| 'sound' \| 'vibrate' \| 'none'` | `'both'` |
| `skip` | `'YYYY-MM-DD' \| null` | "Skip today" from the notification |
| `nudged` | `'YYYY-MM' \| null` | last backup nudge |
| `lowShown` | `'YYYY-MM-DD' \| null` | last low-mood line |
| `askedUseful` | integer | number of check-ins when "Was this useful?" was last asked |
| `cleared` | number (ms) \| null | "Delete all" time, used by sync merge (5.4) |
| `deleted` | array of `d` strings, ≤ 1000 | single deletes, used by sync merge (5.4) |

### 5.3 Cleaning (`normalizeState` in `frontend/src/store/useStore.js`)
New pure functions in `frontend/src/lib/checkin.js`, called the way `cleanWindDown` is: `s.checkins = cleanCheckins(s.checkins); s.checkinPrefs = cleanCheckinPrefs(s.checkinPrefs)`.
- `cleanCheckins`: not an array → `[]`. Keep plain objects only. **Rebuild each entry field by field** (unknown keys are dropped, so a backup can't smuggle in a `__proto__` or a 1 MB field). `d` must match `/^\d{4}-\d{2}-\d{2}$/` and round-trip through `Date`. `id = d`. Enums go through `Set` whitelists. Numbers must be integers in 1–10, otherwise dropped. Strings are trimmed and `.slice(0, N)`, empty → dropped. `later` is dropped without `concern`. `actOwn` is dropped unless `act === 'own'`. `helped` is dropped when `happened === 'no'`. Duplicate `d` keeps the higher `at`. Sort by `d`, `slice(-1000)`.
- `cleanCheckinPrefs`: the same style as `cleanWindDown`. Invalid → default per field.
- Add `DEF.checkins: []` and `DEF.checkinPrefs: {…}`.
- Add `(st.checkins || []).length` to `hasData` in `useStore.js`, so a phone with only check-ins is not overwritten by an empty server copy on first pull.

### 5.4 Sync, export, import, reset, delete

| Path | Behaviour | Change needed |
|---|---|---|
| Android file mirror (`nativeSave`) | Part of the state, as everything else | none |
| Self-host sync (`pushState` / `mergeState` in `frontend/src/lib/sync.js`) | Synced to the user's **own** server only | `mergeState`: `out.checkins = byId(local.checkins, remote.checkins)`, then drop remote entries with `at <= cleared` or `d` in `deleted`, then sort. Without this, **deleted check-ins come back** from another device (the "no common ancestor" shortcut noted at the top of `sync.js`). For sensitive notes that is not acceptable, hence the tombstones. `checkinPrefs` comes from the local device like other settings. |
| Google cloud backup | Excluded already: `data_extraction_rules.xml` excludes every domain under `<cloud-backup>` | none. Add a regression check (section 9). |
| Export backup (Settings `doExport`) | Included (whole state) | Change the Export row subtitle text (section 7). |
| Import backup | Cleaned by `normalizeState` via `replaceState` | `doImport` refuses files without `workouts`, `routines` or `nutrition`. Add `!data.checkins` to that check. |
| Reset everything | `replaceState(DEF)` wipes them | Change the confirm message (section 7). Scheduled check-in notifications are cancelled automatically (6.2, the reminder key includes prefs). |
| Delete one / delete all | Remove the entry / empty the array, and record the tombstone | — |
| Demo build | `buildDemoState` gets **no** check-ins (no fake emotional data in a public demo) | none |

---

## 6. Notifications and deep link

### 6.1 IDs and channel
- Existing: workout reminder 100–106 (`syncReminder` in `frontend/src/lib/mobile.js`), Wind down foreground notification 7041 (`WindDownService.ID`).
- New: **200–213** for one-shot check-in reminders (the next 14 days), **220** for a snooze.
- Android notification channels are immutable once created, and the brief asks for a sound/vibration preference. So create two channels with `LocalNotifications.createChannel`: `checkin-gentle` (default importance, vibration, no sound) and `checkin-sound` (default importance, default sound and vibration). The reminder's `channelId` follows the user's choice. **Prove on device** that `createChannel` with `sound` / `vibration` behaves on Android 13–15.

### 6.2 Scheduling: one-shots, not weekly repeats
Weekly repeats (`schedule.on.weekday`, as `syncReminder` uses) can't skip a single day, and the rule "no reminder once today's check-in is done" needs exactly that. So:
- Pure helper `checkinSchedule(prefs, checkins, now) → [{ id, at: Date, day }]`. It covers the next 14 calendar days. A day counts if it is in `prefs.days` and its local end time is in the future. It excludes a day that already has an entry (`d === day`) or that equals `prefs.skip`. ids are `200 + index`.
- `syncCheckinReminder(S, interactive)` in `mobile.js` cancels 200–213 and schedules the list with `schedule: { at, allowWhileIdle: true }`, `actionTypeId: 'CHECKIN'`, `extra: { kind: 'checkin', day }`, title "End-of-day check-in", body "Your workday is ending. A few minutes to close it?"
- Run it wherever `syncReminder` runs: `boot()` and `nativePersist()` in `useStore.js`, by adding `S.checkinPrefs` and the last entry's `d` to `reminderInputs`. Also on `visibilitychange → visible`, so the 14-day window rolls forward. If the app isn't opened for 14 days, reminders stop. That is acceptable, and arguably kind.
- Permission: the same pattern as `MobileReminderCard.toggle` (interactive only from the Settings switch). Reuse `notificationsAllowed()` for the "Notifications are off" warning row.

### 6.3 Actions and routing
- At boot (mobile only): `LocalNotifications.registerActionTypes({ types: [{ id: 'CHECKIN', actions: [{ id: 'start', title: t('Start') }, { id: 'snooze', title: t('In 15 min') }, { id: 'skip', title: t('Skip today') }] }] })`.
- Register `LocalNotifications.addListener('localNotificationActionPerformed', …)` **in `main.jsx` before the first render**, so a cold start from the notification is not missed. It handles `extra.kind === 'checkin'` only:
  - `tap` or `start` → wait for `ready`, `nav('/home')` (`frontend/src/lib/nav.js`), then open the check-in (or a toast if `S.active`).
  - `snooze` → schedule id 220 at now + 15 min (one pending snooze at most).
  - `skip` → `update(s => { s.checkinPrefs.skip = todayISO() })`, which reschedules through `nativePersist`.
- Language: action titles are registered at boot in the current language. Re-register when the language changes.

### 6.4 Must be proven on a device before building UI on it

**Outcomes so far (2026-11-18):**
- **P2 fails by design** (plugin source): every action button is a `PendingIntent.getActivity` (`LocalNotificationManager.createActionIntents`), so Snooze/Skip would open the app. Per D7, **1.8.0 ships tap-to-open only, with no action buttons**; Snooze/Skip move to 1.8.x with a native receiver.
- **P1 is expected to pass** (source): `BridgeActivity.onCreate` passes the launch intent to `onNewIntent`, and the plugin emits `localNotificationActionPerformed` with `retainUntilConsumed = true`, so a cold-start tap is held until the JS listener registers. Still to confirm on a device.
- **P5 passes:** the 1.7.1 regression on the S21 logged app vibrations from `navigator.vibrate` (EMOM minute cue) in `dumpsys vibrator_manager`.
| # | Question | Fallback if it fails |
|---|---|---|
| P1 | Does `localNotificationActionPerformed` fire on a **cold start** (app killed) from a body tap and from an action button, and is it delivered after the listener registers? | Read the launch intent in a tiny native plugin method (`getLaunchExtra`). |
| P2 | Do **Snooze / Skip** action buttons bring the app to the front? (Capacitor 7 Android uses an activity PendingIntent for actions.) | D7: ship only "Start" plus tap in 1.8.0. Add a `BroadcastReceiver` for snooze/skip in 1.8.x. |
| P3 | Exact timing with and without `SCHEDULE_EXACT_ALARM` granted; after reboot; under Doze. | The behaviour is documented in `PRIVACY.md` already ("up to an hour late"). |
| P4 | Channel sound and vibration settings honoured; the user can still override them in Android settings. | Single channel. |
| P5 | `navigator.vibrate(pattern)` works in the Android WebView (the app holds `VIBRATE`; Workout.jsx already calls `vibrate(30)`, but it is not on the regression list). | Add `@capacitor/haptics`, or a 10-line `vibrate` method on the existing `WindDown` plugin. |
| P6 | Beeps scheduled on the audio clock stay in time for 64 s with the screen on and the wake lock held, with and without a Wind down mix playing. | Drop the sound cues to the start and end only. |

### 6.5 Breathing cues (technical)
- **Sound:** `beep(enabled, freq, dur, when)` in `frontend/src/lib/sound.js` already takes a `when` offset on its own `AudioContext`. At Begin, schedule all cues in one go: 16 phase changes at `k × 4 s` (in = rising 523 Hz, hold = 440 Hz short, out = falling 392 Hz). This runs on the Web Audio clock and needs no JS timer, the same idea as the `sleepAt` backstop in `createNoisePlayer` (`noise.js`). **Stop** must cancel them. `beep` returns nothing today, so add a small `cancelBeeps()` that closes and resets `audioCtx` (it is recreated lazily).
- **Vibration:** one `navigator.vibrate([…])` call with the whole 64 s pattern (short pulse at each phase change, pauses ≤ 10 s each, 32 entries). No timers, and Stop calls `vibrate(0)`.
- **Keeping it alive:** hold a screen wake lock for the exercise (`requestWakeLock` / `releaseWakeLock` in `frontend/src/lib/wakelock.js`), so the app stays in the foreground while the user looks away. With "Play my Wind down sounds" on, the existing `WindDownService` (media foreground service plus partial wake lock) keeps audio running if the user locks the phone anyway. No new native service.
- **Text countdown:** re-render once a second from `Date.now() - startedAt`, so a throttled timer only delays the text and never shifts it. Phase changes go to the `aria-live` region.
- `cue` preference: `sound` / `vibrate` / `both` / `none`. It is separate from the workout `S.sound` setting.

---

## 7. Privacy

Mental-state notes are special-category data under GDPR. The handling matches blood tests:

1. **On-device only.** No network call is added. The self-host build syncs them to the user's own server only (existing behaviour, stated in `PRIVACY.md`).
2. **`PRIVACY.md` changes:**
   - Short version, first bullet: add "end-of-day check-ins" to the list of data that stays on the device.
   - "What is stored" table: new row: *End-of-day check-ins (how you rated your energy and mood, what weighed on you, your notes and plans) | App storage on the phone | No (see "Sync")*.
   - Sharing: "A backup contains your blood test results **and check-ins**, so keep it private."
   - Permissions → Notifications: "only if you turn on the workout-day reminder **or the end-of-day check-in reminder**."
   - Deleting: "Delete check-ins one by one or all at once under Settings → End-of-day check-in. Reset everything also deletes them."
   - Bump the "Applies to … version" line to 1.8.0.
3. **Export warning** (Settings, Export row subtitle): *"Includes your blood test results and check-ins. Keep the file private."* (new string, replaces the current one).
4. **Reset everything confirm:** *"Deletes everything on this device: plan, workouts, body weight, meals and foods, blood tests, check-ins and settings. This cannot be undone."* (new string, replaces the current one).
5. **Google cloud backup:** already excluded (`data_extraction_rules.xml`, plus `backup_rules` for Android ≤ 11). Verify on the regression list.
6. **FLAG_SECURE (`privacyScreen` in `mobile.js`, used by `Labs.jsx`):** **Recommend on** for the check-in history and detail sheet, and for the check-in flow itself (step 0 can show last time's private note, and step 3 is free text). Off again on close. The cost is that screenshots for docs, store listings and QA must come from the web build. That is already the practice for Labs.
7. **No names** guidance in the stressor field (copy only). The app does not scan text.

---

## 8. i18n

### 8.1 New strings (English source keys)
Every string goes into all 11 files in `frontend/src/locales/*.js`, or `i18n-coverage.test.js` fails. Placeholders `{0}` are kept.

**Entry points and Settings**
- End-of-day check-in
- Check-in
- Start my end-of-day check-in
- Today's check-in is done · Do it again
- Replace today's check-in?
- Your new answers replace the ones you saved today.
- Replace
- Finish or discard your workout first.
- Your workday
- Usual end time
- Breathing cues
- Sound and vibration
- Sound
- Vibration
- None
- Start now
- Your check-ins
- No check-ins yet.
- Check-ins stay on this phone. They are included in Export backup.
- Showing your last {0} check-ins
- Delete check-in
- Delete this check-in?
- Delete all check-ins
- Delete all check-ins?
- Deletes every check-in on this device. This cannot be undone.
- Check-in deleted
- All check-ins deleted
- energy {0}
- patience {0}

**Notifications**
- One reminder at your end time on workdays. Not sent once you've checked in.
- Your workday is ending. A few minutes to close it?
- Start
- In 15 min
- Skip today
- Remind me on these days

**Step 0**
- A few minutes to close your workday. Every step is optional.
- From last time
- First step: {0}
- Done with it
- Keep it for tomorrow
- Last time you planned: {0}
- Did it happen?
- Did it help?
- Yes
- Partly
- No
- A little
- Next
- Prefer to skip
- Close
- Leave without saving?
- Nothing from this check-in will be saved.
- Leave

**Step 1**
- Look away from the screen. Sound or vibration will guide you.
- Box breathing
- Breathe naturally
- Breathe in for 4, hold for 4, out for 4, hold for 4. Four rounds, about a minute.
- A quiet minute. Breathe the way you normally do.
- Begin
- Stop
- Breathe in
- Hold
- Breathe out
- Just breathe
- Round {0} of {1}
- Play my Wind down sounds

**Step 2**
- How do you feel right now?
- Calm
- Content
- Worried
- Frustrated
- Overwhelmed
- Feeling low
- Unsure
- Something else
- How much energy do you have left?
- How you rate yourself, not a measurement.
- 1 · very little energy left
- 10 · plenty of energy left
- Energy {0} of 10
- Add patience (optional)
- How much patience do you have left?
- 1 · very little patience left
- 10 · plenty of patience left
- Patience {0} of 10

**Step 3**
- What weighed on you most today?
- Workload
- Deadlines
- Clients or customers
- Team
- Interruptions
- Unclear priorities
- Technical blockers
- Personal
- Nothing specific
- A few words, if you like. No names needed.
- {0} of 200
- Leave something for tomorrow
- What can wait until tomorrow?
- First step tomorrow (optional)

**Step 4**
- What will you do after work tonight?
- Pick one. It's a plan, not a task to tick off.
- Recent
- Quiet
- Movement
- Change of attention
- Connection
- Resting
- Read · Listen to music · Write in a journal · Sit quietly · Go for a walk · Stretch · Ride a bike · Yoga · Cook something · A hobby · A game or puzzle · Tidy up · Call someone · Time with family or friends · Time with a pet · A bath or shower · An early night · Do nothing for a while (18 separate keys)
- Something else…
- Your own idea
- Tomorrow: {0}
- Tomorrow: rest day
- Finish my workday

**Closing**
- Your workday is done.
- Tonight: {0}
- Start my Wind down mix with a 30 min sleep timer
- You've rated your energy very low a few times lately. Talking to someone you trust, or to a doctor or counsellor, can help.
- Your check-ins exist only on this phone. Back them up now and then: Settings → Export backup.
- Was this useful?
- Not really
- Thanks. Your answer stays on this phone.

**Changed (new keys replacing old)**
- Includes your blood test results and check-ins. Keep the file private.
- Deletes everything on this device: plan, workouts, body weight, meals and foods, blood tests, check-ins and settings. This cannot be undone.

Key clashes (checked in `de.js`): English keys are also the displayed English text, so a clashing key needs different English wording, not a suffix.
- `Rest` already means the rest between sets ("Pause"), so the activity group is **"Resting"**.
- `Low` already means a low lab value ("Niedrig"), so the emotion chip is **"Feeling low"** (the stored code stays `low`).
- `Next` ("Weiter") and `Sound` ("Klang") fit as they are. `Start` is translated "Los" (go). That fits the notification action but is worth a check per language.
- `Yes`, `No`, `Close`, `Stop`, `None`, `Team`, `Personal`, `Replace`, `Leave`, `Vibration` are new.

### 8.2 Translation notes
- **Everyday words, not clinical ones.** "Low" means low spirits, not "depressed". "Overwhelmed" means too much at once, not "burnout". Avoid any term that reads as a diagnosis in the target language.
- **Gender-neutral forms.** de, fr, es, it, pt, pl, ru and hi inflect adjectives for gender. Prefer nouns or neutral constructions ("Ruhe", "Calma", "Спокойствие") over "Tranquilo/a". Use the same form across all 8 emotions.
- **Self-rating, not measurement.** Keep "how you rate yourself" literal. Don't translate "energy" as a physical or battery term.
- **Intentions, not tasks.** Activities are plans ("Go for a walk"), not commands or achievements.
- **Low-mood line (D3).** Each language needs a review by a native speaker. It must sound calm and must not name a service. Don't machine-translate it without that review.
- **"Finish my workday"** describes the action (it saves and ends the check-in). It is not a metaphor.
- ko and zh: polite but not formal-honorific register, the same as the rest of the app.

---

## 9. Testing

### 9.1 Unit tests (vitest, alongside the existing `*.test.js`)
`frontend/src/lib/checkin.test.js`:
- `checkinSchedule`: workdays only; today excluded when an entry exists, or when skipped, or when end time has passed; 14-day window; ids 200–213; DST weeks (Europe/Berlin last Sunday of March and October, run with `TZ=`) keep 17:30 local; empty `days` → none; `remind: false` → none.
- `doneToday(checkins, iso)`.
- `cleanCheckins`: rejects non-arrays, non-objects, bad dates (`2026-02-30`), `__proto__` keys, out-of-range or non-integer energy, unknown codes, over-long strings (truncated), `actOwn` without `own`, `helped` with `happened: 'no'`; dedupes by `d` keeping the later `at`; caps at 1000; output has no unknown keys.
- `cleanCheckinPrefs`: invalid time, days with duplicates or out of range, unknown cue.
- `carriedNote(checkins, today)` and `followUpTarget(checkins, today)`: latest earlier entry only; Friday → Monday; nothing when that entry has no `later` / `act`, or already has an `outcome`.
- `recentActivities(checkins)`: top 4 of the last 30 entries.
- `lowMoodDue(checkins, prefs, today)`: 3 qualifying in a row within 10 days; not again within 14 days; broken by one normal entry.
- `showWindDown` (extend `history.test.js`): workday after the end time shows the card; mid-workout never.
- `mergeState` (extend `sync.test.js`): union by day; tombstoned and cleared entries do not return.
- `normalize.test.js`: `DEF` contains the new keys, and a backup without them loads.

### 9.2 Browser checks (web build, Playwright or manual, at 320×640 and 390×844)
- Full path and shortest path. Saved entry contents in `localStorage` match the choices exactly (nothing unchosen present).
- Close mid-flow → nothing saved. Swipe-dismiss is blocked once an answer exists.
- 200% font (browser zoom and Android font scale): no clipping, no horizontal scroll, chips wrap.
- `prefers-reduced-motion: reduce`: text countdown only.
- axe-core pass on every step, the settings sheet and history (0 serious or critical, as in 1.6.2).
- Keyboard only: every control is reachable, focus moves to each step's heading, the number row works with Tab and Enter.
- Screen reader (TalkBack on device, NVDA on web): chip state is announced, energy end labels are read, phase changes are announced once.
- All 12 languages render without overflow at 320 px (de and ru are the longest).

### 9.3 Additions to `docs/RELEASE-CHECKLIST.md` (listed here, not edited)
**§3 Home**
- [ ] On a workday after the check-in end time, the Wind down card shows "End-of-day check-in". It is hidden during an active workout.

**New §13 End-of-day check-in** (insert before "Rules for every build")
- [ ] Wind down sheet → Start my end-of-day check-in → all steps → Finish my workday → entry in Settings → End-of-day check-in history with exactly the chosen fields.
- [ ] Skip every step → Finish → entry saved, today's reminder not delivered.
- [ ] Kill the app mid-flow → reopen → nothing saved.
- [ ] Box breathing with the screen on and the phone face down: 16 sound cues and vibrations in time (≈64 s), Stop cancels them. Repeat with cues set to Vibration only and Sound only.
- [ ] Breathing with "Play my Wind down sounds" on, then lock the phone: the sound continues, and the notification shows Pause.
- [ ] Closing screen → Start my Wind down mix with a 30 min sleep timer → plays and the notification shows the fade time.
- [ ] Redo today → confirm → one entry for today.
- [ ] Workout in progress → Start is disabled. Notification tap → Home plus a toast.
- [ ] Next workday: "From last time" and "Did it happen?" appear once, and the answer is saved on the earlier entry.
- [ ] History sheet and check-in flow: a screenshot is blocked and recent apps shows a blank preview (FLAG_SECURE).
- [ ] TalkBack: complete one check-in using TalkBack only.

**§10 Settings, notifications**
- [ ] End-of-day check-in reminder: permission asked only on toggle; fires at the end time on a chosen workday; not delivered on non-workdays; not delivered after today's check-in; Snooze → fires again in 15 min; Skip today → nothing more today; tap and Start from a **killed** app open the check-in.
- [ ] Change the end time and the days → the next reminder follows. Reboot the phone → the reminder still fires.
- [ ] Sound vs vibration channel preference honoured.

**§11 Backup, import, export**
- [ ] The export subtitle mentions check-ins. Export → import on a fresh install restores check-ins and check-in settings.
- [ ] Reset everything deletes check-ins and cancels pending check-in reminders.
- [ ] Delete one / Delete all check-ins.

**§12 Privacy**
- [ ] Cloud backup excludes check-ins (same spot check as the existing item).

---

## 10. Metrics without telemetry

The app sends nothing anywhere, and this feature does not change that. Success is judged in two ways.

**On the user's own device (visible to them only)**
- History list with counts ("{n} check-ins").
- 1.8.x: a weekly summary in plain words with entry counts, for example "This week: 4 check-ins. Most often: Workload (3). You planned a walk 3 times; it happened twice." No scores, no charts that look like measurements.

**How the product owner learns**
1. **Moderated user tests** (5–8 people) on a debug build, observed with consent, using a seeded test profile only. Tasks: first setup, full path, shortest path, reminder from a locked phone, find and delete an entry, TalkBack run. Measures: time per step against the 5-minute budget, where people hesitate, whether anyone feels the energy row implies measurement, and the wording of D3.
2. **"Was this useful?" in the app.** Yes / Not really on the closing screen, asked on the 3rd check-in, then every 10th (`askedUseful`). Stored only in the entry (`useful`). The user can see it in their history. It never leaves the device unless the user chooses to tell us.
3. **Voluntary feedback**: GitHub issues and discussions (the link already sits in Settings), plus an "End-of-day check-in feedback" issue template.

Release decision for 1.8.0: moderated tests show the median full path ≤ 5 min, the shortest path ≤ 20 s, no participant reads the ratings as a measurement, and the TalkBack run completes without help.

---

## 11. Phasing

| Release | Scope |
|---|---|
| **1.8.0 (P0)** | Everything in sections 3–9: preferences, one reminder (Start, plus Snooze/Skip if P2 passes), disconnect step with box or natural breathing, emotion, energy and optional patience, stressor and note, leave-for-tomorrow, tonight's activity plus tomorrow's workout, finish and closing, private history with delete one / all, next-day follow-up, low-mood line (if D3 is approved), monthly backup nudge, "Was this useful?", 12 languages, privacy updates. |
| **1.8.x** | Weekly summary as plain descriptions with entry counts. Follow-through view ("planned vs happened" per activity, counts only). Editable favourite activities. A "short version" preference (only steps 2 and 4). Native receiver for Snooze/Skip if P2 fails. Night-shift date handling (R6). Self-host web reminder via the existing Web Push. |
| **Not planned** | AI summaries or advice, wearables/HRV, employer or team views, analytics, a meditation library, streaks or badges for check-ins, sharing check-ins, a check-in home-screen widget. |

---

## 12. Effort and risks

### 12.1 Estimate (working days, one developer)

| Part | Days |
|---|---|
| `lib/checkin.js` (codes, cleaners, schedule, carry-over, low-mood, recent) plus unit tests | 1.5 |
| Store wiring (`DEF`, `normalizeState`, `hasData`, `mergeState` tombstones, import check) plus tests | 0.5 |
| Check-in flow UI (`checkin-sheets.jsx`, 7 screens, number row, locking, focus handling) | 3 |
| Breathing step (audio-clock cues, vibration pattern, wake lock, reduced motion, mix toggle) | 1.5 |
| Reminder plus deep link (`syncCheckinReminder`, channels, action types, listener in `main.jsx`) | 1.5 |
| Device proofs P1–P6 (before building on them) | 1 |
| Settings sheet, history, delete, Notifications row, Wind down and Home changes | 1.5 |
| i18n: about 140 strings × 11 languages, plus review of emotional wording | 1.5 |
| `PRIVACY.md`, changed strings, release notes | 0.5 |
| Browser checks (320/390, 200%, axe, keyboard) and the device regression run | 1.5 |
| **Total** | **≈ 14 days**, plus 1–2 days if P2 fails and a native receiver is needed in 1.8.0 |

### 12.2 Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Notification action buttons open the app or miss cold starts (P1/P2) | Prove first. Fall back to Start + tap only. |
| R2 | Reminders late under Doze or without the exact-alarm permission | Already documented. Same handling as the workout reminder. |
| R3 | WebView vibration is a no-op on some phones (P5) | Haptics plugin or a native method. The text countdown always works. |
| R4 | Deleted check-ins come back through self-host sync | Tombstones in `checkinPrefs` (5.4) plus a merge test. |
| R5 | Copy reads as a health claim or diagnosis, especially in translation | Rules in 8.2, native review of D3, moderated test question. |
| R6 | Night shifts: a check-in after midnight is dated the next day and the reminder logic treats days by calendar date | Documented P0 limit; 1.8.x fix. |
| R7 | Sensitive data on a lost or unlocked phone | FLAG_SECURE on the flow and history. No lock screen of our own (out of scope). The device lock is the user's protection, so say this in `PRIVACY.md`. |
| R8 | Data loss on uninstall (seen with another app the day this was written) | Monthly backup nudge. The footer says check-ins are only on this phone. |
| R9 | State growth on old phones | 1000-entry cap and field limits (≤ 0.9 MB worst case). |
| R10 | Scope creep into "wellbeing platform" | The non-goals and "Not planned" list are the guardrail for review. |
