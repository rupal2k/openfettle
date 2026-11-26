// "Things that can help": which activity suggestions follow from the latest Self-check results
// (docs/specs/2026-11-26-move-for-your-mind.md). Pure rules, no text: the sheet turns tip ids
// into words and buttons. General wellness from public guidelines, never a treatment.
import { INST_IDS, band, score, selfHarm, lastOf } from './selfcheck.js'

export const WEEK_TARGET = 150          // WHO 2020: 150–300 min of moderate activity a week
export const STALE_DAYS = 90            // older results don't drive suggestions any more
export const MAX_TIPS = 3
// Mental-health wording stays English until a native speaker has reviewed each language
// (the check-in's LOW_MOOD_LANGS rule); diabetes, alcohol and general tips show in every language.
export const TIP_LANGS = ['en']

const DAY = 864e5
const isoDays = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY)

// Active minutes in the `days` days up to and including `today`: finished workouts, start to end,
// each capped at 4 h so a session left open overnight doesn't count as a day of training.
export function activeMinutes(workouts, today, days = 7) {
  let m = 0
  for (const w of workouts || []) {
    const age = isoDays(w.d, today)
    if (age < 0 || age >= days || !(w.end > w.start)) continue
    m += Math.min(240, (w.end - w.start) / 6e4)
  }
  return Math.round(m)
}
const trainedDays = (workouts, today, days = 7) => new Set((workouts || []).filter(w => { const a = isoDays(w.d, today); return a >= 0 && a < days }).map(w => w.d)).size
const strengthRecently = (workouts, today) => (workouts || []).some(w => { const a = isoDays(w.d, today); return a >= 0 && a < 14 && (w.entries || []).some(e => (e.sets || []).some(s => s.done && s.w > 0)) })

// What the latest results say, one flag per kind. Only the latest result of each check counts,
// and only while it is fresh.
export function flagsOf(list, today) {
  const latest = INST_IDS.map(i => lastOf(list, i)).filter(e => e && isoDays(e.d, today) < STALE_DAYS)
  const by = Object.fromEntries(latest.map(e => [e.inst, e]))
  const phq = by.phq9 && score('phq9', by.phq9.a)
  return {
    any: latest.length > 0,
    severe: !!by.phq9 && (phq >= 20 || selfHarm('phq9', by.phq9.a)),
    mood: (!!by.phq9 && phq >= 5) || (!!by.who5 && band(by.who5).code === 'low'),
    anxiety: !!by.gad7 && score('gad7', by.gad7.a) >= 5,
    alcohol: !!by.auditc && band(by.auditc).code === 'over',
    diabetes: !!by.idrs && band(by.idrs).level !== 'good',
  }
}

// → { tips: [{ id, why: [reasons] }], gentle, mental, minutes }  (why: every result that led to it, most serious first)
//   gentle: a severe result or a self-harm answer; the sheet puts support first and folds these away
//   mental: some tip is there because of a mood, anxiety or wellbeing result (TIP_LANGS applies)
export function tipsFor({ selfchecks, workouts, today }) {
  const f = flagsOf(selfchecks, today)
  const minutes = activeMinutes(workouts, today)
  const out = { tips: [], gentle: false, mental: false, minutes }
  if (!f.any) return out
  if (f.severe) {
    // support comes first; only gentle movement, no targets or intensity
    return { ...out, gentle: true, mental: true, tips: [{ id: 'gentle-walk', why: ['severe'] }, { id: 'mobility', why: ['severe'] }] }
  }
  const add = (id, why) => { const t = out.tips.find(x => x.id === id); if (t) t.why.push(why); else out.tips.push({ id, why: [why] }) }
  const walk = minutes >= WEEK_TARGET ? 'keep-moving' : 'walk'
  if (f.mood) {
    out.mental = true
    if (trainedDays(workouts, today) >= 6) add('rest', 'mood')   // hard every day and low: rest, not more
    else add(walk, 'mood')
    add('strength', 'mood'); add('mobility', 'mood')
  }
  if (f.anxiety) { out.mental = true; add('breathing', 'anxiety'); add(walk, 'anxiety'); add('mobility', 'anxiety') }
  if (f.diabetes) { add(walk, 'diabetes'); add('strength', 'diabetes') }
  if (f.alcohol) add('evening', 'alcohol')
  if (!out.tips.length) {
    add('keep', 'fine')
    if (!strengthRecently(workouts, today)) add('strength', 'fine')
  }
  out.tips = out.tips.slice(0, MAX_TIPS)
  return out
}

// The reasons a tip may give in this language (mental-health ones only in TIP_LANGS); none → hide the tip.
const MENTAL = ['mood', 'anxiety', 'severe']
export const reasonsShown = (tip, lang) => TIP_LANGS.includes(lang) ? tip.why : tip.why.filter(w => !MENTAL.includes(w))

// "Since your last check": sessions and active minutes after the earlier result's day, up to the newer one's
export function sinceLast(workouts, from, to) {
  const days = isoDays(from, to)
  if (days < 1) return null
  const n = (workouts || []).filter(w => { const a = isoDays(w.d, to); return a >= 0 && a < days }).length
  return { n, minutes: activeMinutes(workouts, to, days) }
}
