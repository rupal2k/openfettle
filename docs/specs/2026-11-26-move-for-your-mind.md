# Exercise suggestions from Self-checks ("Move for your mind")

Status: **Phases 1–3 built for 1.9.0** (branch `feat/things-that-can-help`). Decisions taken 2026-11-26: D1 "Things that can help", D2 English-only mental-health cards until reviewed (`TIP_LANGS`), D3 folded and gentle under the support card, D4 Brisk walk routine in Phase 2, D5 top of the hub (Phase 2).

## 1. The problem and the bet

Self-checks (1.8.2) tell a person where they stand: low wellbeing, low mood, anxiety, risky drinking, diabetes risk. Then the result ends with "talk to a doctor" and the app does nothing else, though it is a training app with ready-made plans, a timer and a breathing exercise.

**Bet:** the right next step after a result is a small, specific thing to do in OpenFettle this week, chosen from what the research supports for that result and from what the person already does. Not a diagnosis, not a treatment, and never instead of help.

Who it is for: people who took a check and got a result worth acting on, mostly beginners (the app's main users) and people who already train but whose mood or risk says "more of the right kind".

## 2. What the evidence supports (and what it doesn't)

| Result | What helps, per the research | What we will NOT claim |
|---|---|---|
| Everyone | WHO 2020 guidelines: 150–300 min/week moderate activity (or 75–150 vigorous) plus muscle strengthening on 2+ days; any amount beats none | That meeting it fixes a condition |
| Low mood (PHQ-9 5–19), low wellbeing (WHO-5 < 50) | Walking or jogging, yoga, strength training and mixed aerobic work all reduce depressive symptoms; more intensity → larger effect, but any is better than none (Noetel et al., BMJ 2024, network meta-analysis of 218 trials) | That exercise replaces therapy or medication |
| Anxiety (GAD-7 ≥ 5) | Regular aerobic exercise reduces anxiety symptoms; physical activity broadly helps depression, anxiety and distress (Singh et al., Br J Sports Med 2023 umbrella review). Slow breathing helps in the moment | That it treats an anxiety disorder |
| Risky drinking (AUDIT-C over the cut-off) | Evidence that exercise reduces drinking is mixed. A regular evening routine can replace a habit; the honest message is "cut down, and here is something to do instead" | That exercise lowers drinking |
| Diabetes risk (IDRS 30+) | Lifestyle change with ~150 min/week of activity cut type 2 diabetes incidence by 58% (Diabetes Prevention Program, NEJM 2002) and by ~29% in India (Indian DPP, Diabetologia 2006). Strength training improves insulin sensitivity. Physical activity and waist are part of the IDRS itself | That it prevents diabetes for this person |
| Severe low mood (PHQ-9 ≥ 20) or **any self-harm answer** | Support comes first. Gentle activity can still help later | Anything that puts exercise ahead of the support card |

Sources go in the suggestion's "Why" line, the same way each questionnaire shows its source today.

**Safety line on every set of suggestions** (adapted from PAR-Q+ screening): "If you have heart trouble, chest pain, feel faint when active, or are pregnant, ask a doctor before starting harder exercise."

**Regulatory framing:** general wellness and lifestyle information that follows public guidelines (WHO), linked to the result only as "people with results like this often benefit from". No doses, and no wording like "treatment for depression". This keeps it outside medical-device software rules in the US (FDA general-wellness policy), the EU (MDR) and India (CDSCO medical-device rules), and matches how the app frames Labs and Self-checks today ("not medical advice").

## 3. The experience

### Where it shows

1. **Under each result** (the result sheet, also opened from My Stats): a section **"Things that can help"** with 2–3 suggestion cards. For a severe result or a self-harm answer it sits *below* the support card, collapsed, under "When you feel ready".
2. **Self-checks hub**, top: **"Suggested for you"**, built from the latest result of each check (one place to come back to).
3. **Not on Home**, for the same reason the Home card shows only a count: Home can be seen by others. A suggestion that says "for low mood" would give the result away.

### A suggestion card

- **What:** "Brisk walk, 10 minutes, 3 times this week"
- **Why** (one line + source): "Walking lowers depression symptoms in trials; any amount helps. (BMJ 2024)"
- **Your week:** "You've logged 40 of 150 minutes in the last 7 days" (from the phone's own workouts, never sent anywhere)
- **One button that does it:** Start now / Load this plan / Open breathing
  - plans load **without changing the weekly schedule** unless the person chooses to, as the interval and Mobility plans already do

### Rules (deterministic, on the phone, no AI)

| Latest result | Suggestions (in order) |
|---|---|
| PHQ-9 ≥ 20, or a self-harm answer | Support card first. Under "When you feel ready": a 10-minute walk outside; Mobility & Core. Nothing about intensity or targets |
| PHQ-9 5–19 or WHO-5 < 50 | Walk or jog toward 150 min/week; strength twice a week (Beginner Full Body, or Home Bodyweight if they train at home); Mobility & Core (yoga-style) |
| GAD-7 ≥ 5 | Box breathing (the check-in exercise, 2 min); regular moderate walking or cycling; Mobility & Core. Note: "Hard intervals raise your heart rate like anxiety can; build up gradually" |
| AUDIT-C over the cut-off | An evening routine in place of a drink: Wind down plus a short walk; the cut-down help links that already exist. No claim that exercise lowers drinking |
| IDRS 30–59 / 60+ | 150 min/week brisk walking; strength twice a week; the existing "ask a doctor for an HbA1c" line for 60+ |
| All results fine | "Keep it up": what they already do, plus strength if none was logged in 14 days |

**Personalised by what they already do** (last 7 days, from `S.workouts`): under 150 min → build up from 10-minute blocks; already active → add the missing kind (strength or aerobic) or keep going; trains hard every day and has low mood → suggest a rest day and Mobility & Core instead of more intensity.

At most 3 cards. When several results apply, the most serious leads (self-harm/severe → mood → anxiety → diabetes risk → alcohol → general), and duplicate suggestions merge.

## 4. What we won't do

- No streaks, badges or "you missed your walk" nudges linked to mental-health results. Guilt is the wrong lever here.
- No notification that names a result.
- No calorie or weight-loss targets from a mood result. Low mood plus weight targets is an eating-disorder risk.
- No new data leaves the phone. The only new stored field is which suggestions the person hid.

## 5. How we'll know it works

The app has **no analytics**, by design, so there's no central dashboard. Instead:

- **On the phone, private:** after 14 days, the next check's result card shows "Since your last check you logged X sessions" next to the score change that already exists. The person sees their own link between moving and feeling, which is the product's real value.
- **One optional question**, the pattern the check-in uses (`askedUseful`): "Were these suggestions useful?" (Yes / Not really), stored locally and included in backups. Never sent.
- **Qualitative:** a GitHub issue template "Suggestions feedback"; review the first 30 days of issues.
- **Release gate:** device suite section 13 grows to cover every rule row (fixtures per result type).

Leading indicator we *can* see: whether people open and use it (GitHub issues, reviews). Lagging: none, honestly. A study would need an opt-in research build, which is out of scope.

## 6. Decisions needed

- **D1 Name:** "Things that can help" (plain, matches the app's voice), or "Move for your mind".
- **D2 Languages:** mental-health wording in 10 machine-translated locales. The check-in's low-mood line went English-only until a native speaker reviewed it (`LOW_MOOD_LANGS`). Same here: English-only cards for PHQ-9/GAD-7/WHO-5 until reviewed, with the diabetes and general cards translated?
- **D3 Severe results:** show suggestions at all under the support card (collapsed), or hide them entirely for PHQ-9 ≥ 20 / self-harm answers? Recommendation: collapsed, below support, gentle only.
- **D4 Walking:** add a ready-made "Brisk walk" timed routine (10/20/30 min) to the plan catalogue, so a walk can be started and logged like any session. Today walking can only be logged as a cardio exercise inside a routine.
- **D5 Hub placement:** top of the hub, or after the questionnaire list.

## 7. Implementation plan

### Phase 1 — suggestions under a result (≈ 3–4 days)

| Step | Files | Notes |
|---|---|---|
| 1. Rules engine | `frontend/src/lib/move.js` (new), `move.test.js` | `suggestionsFor(results, workouts, today) → [{ id, kind, minutes, action, why, source }]`. Pure, no React. Uses `band()`, `selfHarm()`, `lastOf()` from `lib/selfcheck.js`, minutes from workout `start`/`end`. Table-driven tests: one per rule row, plus merging, ordering, the self-harm override and the activity-gap text |
| 2. Weekly minutes | `lib/history.js` | `activeMinutes(S, days = 7)`: sums finished workouts, plus cardio sets' time. Unit test |
| 3. Actions | `sheets.jsx` (existing `loadStarterPlan`, `startFlow`), `checkin-sheets.jsx` | Reuse: load a plan without changing the week (as interval/Mobility plans already do); start breathing straight from a card (small export from the check-in sheets) |
| 4. UI | `selfcheck-sheets.jsx` (`Result`) | "Things that can help" section: cards + safety line + sources; collapsed under the support card for severe/self-harm results; "Hide this" per card |
| 5. Stored state | `store/useStore.js` (`normalizeState`), `lib/selfcheck.js` (`cleanSelfcheckPrefs`) | `selfcheckPrefs.hiddenTips: []`. Clean on load, keep in backup/sync (merge as a union) |
| 6. Strings | `locales/*.js` | ~25 strings. Per D2, mental-health cards gated by a `TIP_LANGS` list like `LOW_MOOD_LANGS`; `i18n-coverage` test stays green |
| 7. Device tests | `e2e/device/sections/13-selfchecks.mjs`, `lib/fixtures.mjs` | Fixtures per result type; check the cards, the severe/self-harm order, that a card's button loads the plan without changing the week, and that Home shows no suggestion |
| 8. Docs | `docs/specs` (this file), `CHANGELOG.md`, `PRIVACY.md` (one line: hidden-tip list stays on the phone) | |

### Phase 2 — the hub and walking (≈ 2 days)

- "Suggested for you" at the top of Self-checks (D5), from the latest result of each check.
- "Brisk walk" routine (D4): the library has no outdoor walk, so the first "Start a walk" makes a custom cardio exercise and a one-exercise routine (10 min at 5 km/h, lengthened in the session); not in the week. Built as a card action rather than a catalogue plan, since catalogue plans may only use library exercises.
- Follow-up line on the next result: "Since your last check: N sessions, M minutes."

### Phase 3 — feedback (≈ 1 day)

- "Were these suggestions useful?" once, on a just-saved result that shows suggestions when there are 2+ results; stored locally (`selfcheckPrefs.tipsAsked`, `tipsUseful`), synced, in backups.
- GitHub issue template.

### Release

Version 1.9.0 (a new feature), versionCode ≥ 26. Before the build, the full device suite plus the new section-13 rows on the S21, and the Nothing Phone 1 if connected. Then the usual PR, CI, merge, tag, release and site "New in 1.9" (copy for sign-off).

## 8. Risks

| Risk | Mitigation |
|---|---|
| Reads as medical advice | Guideline framing, sources, the safety line, "not medical advice" kept, no doses |
| Harm for someone in crisis | Self-harm/severe → support first, suggestions collapsed and gentle |
| Guilt or pressure | No streaks, nudges or notifications tied to results |
| Mistranslated mental-health text | English-only gate until reviewed (D2) |
| Privacy | Nothing leaves the phone; nothing on Home; My Stats stays FLAG_SECURE |
| Suggests something they can't do (no gym) | Use the plan "where" they already use (gym/home/home gym); default to home |
