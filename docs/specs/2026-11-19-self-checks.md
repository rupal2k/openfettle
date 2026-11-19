# Self-checks (phases 1 and 2)

Status: built on `feat/self-checks`, not released. Items marked **Decision** need sign-off before a release.

## Goal

Short, published health questionnaires that point to something worth checking, without diagnosing, for users in India and in other countries. Answers stay on the phone; backup and own-server sync include them, the same as check-ins.

## Phase 1 scope

| Check | What it is | Region | Wording |
|---|---|---|---|
| WHO-5 Well-Being Index | Wellbeing over the last two weeks; due again after 14 days | Everyone | Verbatim English (WHO 2024 edition) |
| PHQ-9 (phase 2) | Low mood over the last two weeks; due again after 14 days | Everyone | Verbatim English (Pfizer form) |
| GAD-7 (phase 2) | Anxiety over the last two weeks; due again after 14 days | Everyone | Verbatim English |
| AUDIT-C | Alcohol use, questions 1-3 of the WHO AUDIT | Everyone; the drink-size note differs (India: small/large peg) | Verbatim English (WHO AUDIT manual, 2001) |
| Indian Diabetes Risk Score | Type 2 diabetes risk (age, waist, activity, parents) | Shown to everyone, labelled "made for people of Indian origin" | Translated (a risk score, not a fixed-wording questionnaire) |
| American Diabetes Association risk test | Link out (no reuse terms found, so not embedded) | Everyone ("for other populations") | Their website |
| hearWHO, WHOeyes | Link out to the free WHO apps | Everyone | Their apps |
| Talk to someone | India: Tele-MANAS 14416 (call), 112 in an emergency. Elsewhere: findahelpline.com and the local emergency number | By region | Translated |

**Region:** India when the time zone is `Asia/Kolkata`, otherwise international. The user can change it in the sheet ("Where you live"). The region sets only the helplines and the drink sizes, never which checks exist.

**Where:** Settings → Self-checks. There's no Home card or reminder.

**Behaviour added after the audit (2026-11-20):**
- The two-weekly checks show "Due" only 14 days after the last result, never before the first one.
- Unfinished answers are kept in memory (never saved) when the sheet is closed, with "Start again"; they go when the result is shown, on Delete all, or when the app is closed.
- Escape closes only the top sheet (app-wide, components/Modals.jsx).
- Switching cm/in converts the waist already typed. The age is filled in from the birth year only when both possible ages fall in one band.
- "Change since last time" says which way is better (WHO-5 higher, PHQ-9/GAD-7 lower).
- The self-harm card is a live alert when it first appears, not when an old result is reopened.
- PRIVACY.md lists self-check results, the outside links and the delete path.

## Scoring (lib/selfcheck.js, tested in selfcheck.test.js)

- **WHO-5:** items score 5 ("All of the time") to 0 ("At no time"). Raw 0-25, shown ×4 as 0-100. Below 50 (raw below 13) is the WHO's suggested cut-off for poor wellbeing and further assessment. A low result shows the helplines straight away. The change since the last WHO-5 is shown as a number with no interpretation.
- **PHQ-9:** items score 0-3, 0-27 in all. Cut points 5 / 10 / 15 / 20 for mild, moderate, moderately severe and severe (instruction manual); 10+ is the manual's "yellow flag", and then the helplines show. The unscored 10th question (how difficult the problems made things) is left out.
- **Self-harm (PHQ-9 item 9):** any answer above "Not at all" shows a support card straight under the question, before the user reaches the result, and again at the top of the result, above the score, whatever the total. The card has the region's helpline and an emergency line (India: call 112 or go to the nearest hospital emergency department; elsewhere: the local emergency number). It shows again whenever that result is reopened.
- **GAD-7:** items score 0-3, 0-21 in all. Cut points 5 / 10 / 15 for mild, moderate and severe; 10+ shows the helplines.
- **AUDIT-C:** 0-4 per question, 0-12 in all. "Never" skips questions 2-3 (scored 0). A positive screen is 4+ for men and 3+ for women (Bradley 2007). Asks woman/man, prefilled from the profile.
- **IDRS (Mohan 2005):**
  - age <35 / 35-49 / 50+ scores 0/20/30;
  - waist, women <80 / 80-89 / 90+ cm and men <90 / 90-99 / 100+ cm, scores 0/10/20;
  - activity: regular exercise and strenuous work / one of the two / no exercise and sedentary work scores 0/20/30 (the original three levels; a four-level 0/10/20/30 version in some later studies is a modification, and phase 1 had used it by mistake — fixed 2026-11-20);
  - parents with diabetes none / one / both scores 0/10/20;
  - bands: under 30 low, 30-50 moderate, 60+ high.

  Waist is entered in cm or inches, and values outside 40-200 cm are refused. Age is prefilled from the profile's birth year. If Labs has an HbA1c, the result shows it ("a measured value tells you more than a risk score").

Entries store answer indices, the date, the time and (for AUDIT-C/IDRS) `sex`, never text:
`{ id, inst, d, at, a: [..], sex? }` in `S.selfchecks`. Deletes are recorded in `S.selfcheckPrefs.deleted` (single result) and `.cleared` (delete all), so sync never brings a deleted result back.

## Licences and sources

| Item | Terms found | Use here |
|---|---|---|
| WHO-5 | © WHO 2024, CC BY-NC-SA 3.0 IGO: non-commercial copying allowed with citation; no WHO logo; no implied endorsement | OpenFettle is free and non-commercial: shown verbatim, cited, no logo. **Decision:** CC-NC text inside an AGPL app. The instrument stays under its own licence (noted in the source line); a commercial fork would need WHO permission. |
| AUDIT / AUDIT-C | WHO: may be reproduced and translated, not for sale; widely described as public domain for non-commercial use | Same as WHO-5 |
| IDRS | Published method (J Assoc Physicians India 2005;53:759-63, PMID 16334618); no licence terms found | The scoring method is cited, and the wording is our own. Checked 2026-11-20 against two studies that quote the original table (Cureus 2023;15(7):e41880 and others): age 0/20/30, waist 0/10/20, activity 0/20/30, parents 0/10/20; bands <30, 30-50, ≥60 (totals are multiples of 10, so nothing falls between 50 and 60). The original paper itself was not readable. |
| ADA risk test | No reuse terms found | Link only |
| FINDRISC | No reuse terms found (Finnish Diabetes Association) | Not used; ask the association if an embedded international diabetes score is wanted |
| PHQ-9 / GAD-7 | Pfizer form: "No permission required to reproduce, translate, display or distribute." | Built in phase 2, verbatim, with the Pfizer line in the source. PHQ-9 wording from the Pfizer form (APA copy); GAD-7 wording from the Pfizer form (checked 2026-11-20 against the Health PEI copy; the ADAA copy differs slightly, e.g. "it's"); cut points from the PHQ/GAD-7 instruction manual. |
| PSS-10, ISI, ESS, STOP-Bang | Licensed (Mapi and others) | Not used unless a licence is granted |

## Translations

WHO-5, PHQ-9, GAD-7 and AUDIT-C stay in English in every language, with the note "Shown in English, the wording it was tested in." Official translations exist (the WHO AUDIT manual lists Hindi, and WHO-5 has many), but phase 1 adds one only from a verified official text. **Decision:** source the Hindi AUDIT and the official WHO-5, PHQ-9 and GAD-7 translations (the PHQ/GAD-7 ones are on phqscreeners.com, including Hindi) for the app's languages. All other strings are in the 11 locale files (machine-assisted, like the rest of the app, and not yet checked by native speakers).

## Not in phase 1

- Reminders, a Home card and a trend chart.
- Camera, hearing or vision tests built into OpenFettle: only the WHO apps are linked.

## Test record (2026-11-19, web demo build, 360 px)

- Unit: 11 new tests (scoring with worked examples, cut-off edges, cleaning, sync deletes). The full suite passes: 696.
- E2E (Edge, `Asia/Kolkata` and `Europe/London`): 32 checks passed, with no console errors. They covered:
  - the helpline by region, and the drink note by region;
  - WHO-5 20/100 → low, with support shown;
  - AUDIT-C woman 3 → over the cut-off, and "Never" hiding questions 2-3;
  - IDRS man 50+, 40 in waist, sedentary, one parent → 90 high;
  - a bad waist value refused;
  - results saved as indices only, kept after reload, and one deleted with its tombstone;
  - Hindi: the UI translated, and WHO-5 verbatim English with the note.
- Not yet: a real phone (the `tel:` link to 14416, links opening outside the app, TalkBack).

## Test record, phase 2 (2026-11-19, web demo build, 360 px)

- Unit: 4 new tests (PHQ-9 band edges at 4/5/9/10/14/15/19/20/27, GAD-7 edges, item 9 flagged even at a minimal total, cleaning). The full suite passes: 700.
- E2E (Edge, `Asia/Kolkata` and `Europe/London`): 21 checks passed, with no console errors. They covered:
  - the verbatim PHQ-9 stem;
  - no card for "Not at all" on item 9; the card under item 9 as soon as it's answered above that, with Tele-MANAS and 112 (India) or findahelpline.com and the local emergency number;
  - the card above the score on the result (9 → mild), with one helpline section;
  - GAD-7 14 → moderate, with helplines and no self-harm card;
  - answers stored as indices; the card shown again in the history;
  - Hindi: verbatim English items, translated card.
- Not yet: a real phone, TalkBack reading the card (it is a `role="alert"`).

## Audit re-run (2026-11-20)

All 10 findings fixed, plus one more found on the re-run: the questionnaire sheet lost its dialog name when it turned into the result (axe `aria-dialog-name`); the sheet now keeps one heading. Unit tests: 704 pass. E2E: 23 fix checks + 32 phase-1 + 21 phase-2 checks pass; axe finds no violations on the hub, the questionnaires, the PHQ-9 card and the results; 320 px and light theme checked.

## Open items worked (2026-11-20)

- GAD-7 wording now follows the Pfizer form (the "No permission required" one, like the PHQ-9): "Over the last 2 weeks", "anxious or on edge", "it is hard to sit still".
- IDRS activity corrected to the original three levels (0/20/30); see Scoring.
- Large text: every font size in the sheets scaled ×1.3 and ×2.0 (an approximation of Android text zoom): nothing clipped or off-screen.
- Official translations: not added. phqscreeners.com says the translations are free to use, but they need copying from the official PDFs and a native speaker's check, which can't be done reliably from extracted PDF text.
