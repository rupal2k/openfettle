// Starting data for each section. Every section names one and gets exactly that, so no section
// depends on what an earlier one left behind. Dates are moved so the history always ends two
// days before the run, whatever day it is.
import { readFileSync } from 'node:fs'

const base = JSON.parse(readFileSync(new URL('../fixtures/base.json', import.meta.url), 'utf8'))
const DAY = 864e5
export const iso = (ms = Date.now()) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const atNoon = d => new Date(d + 'T12:00:00').getTime()

// What the fixtures hold, for the tests to compare against.
export const FACTS = {
  workouts: base.workouts.length,                                    // 3
  routines: base.routines.map(r => r.name),
  bodyweight: 70,
  todayRoutine: 'Beginner A',
}

function shifted() {
  const s = structuredClone(base)
  const last = Math.max(...s.workouts.map(w => atNoon(w.d)))
  const delta = Math.round((atNoon(iso()) - 2 * DAY - last) / DAY) * DAY
  const day = d => iso(atNoon(d) + delta), ms = t => t && t + delta
  for (const w of s.workouts) Object.assign(w, { d: day(w.d), start: ms(w.start), end: ms(w.end) })
  for (const b of s.bodyweight) Object.assign(b, { d: day(b.d), t: ms(b.t) })
  for (const k in s.exWeights) s.exWeights[k].d = day(s.exWeights[k].d)
  return s
}

export const fixtures = {
  // a fresh install: no saved state at all
  fresh: () => null,
  // a trained user: 6 routines (strength, Tabata, EMOM, AMRAP), 3 workouts, one weigh-in, and
  // today planned as Beginner A so Home's hero starts a real workout
  trained: () => {
    const s = shifted()
    s.dayPlan = { [iso()]: s.routines.find(r => r.name === FACTS.todayRoutine).id }
    return s
  },
  // trained, plus self-check results: WHO-5 taken 20 days ago (32/100, due again) and a PHQ-9 3 days ago
  selfchecks: () => {
    const s = fixtures.trained(), now = Date.now()
    s.selfchecks = [
      { id: 'ofreg-who5', inst: 'who5', d: iso(now - 20 * DAY), at: now - 20 * DAY, a: [3, 3, 4, 4, 3] },
      { id: 'ofreg-phq9', inst: 'phq9', d: iso(now - 3 * DAY), at: now - 3 * DAY, a: [1, 1, 1, 1, 1, 1, 1, 1, 0] },
    ]
    s.selfcheckPrefs = { region: 'in', deleted: [], cleared: null }
    return s
  },
}
