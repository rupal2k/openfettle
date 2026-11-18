// End-of-day check-in (docs/specs/2026-11-18-evening-check-in.md): codes, backup cleaning, the
// reminder schedule, carry-over between days and the breathing plan. Pure functions only; the
// screens are in checkin-sheets.jsx. Everything is stored as codes, never translated text.
import { isoOf } from './format.js'

export const MOODS = ['calm', 'content', 'worried', 'frustrated', 'overwhelmed', 'low', 'unsure', 'other']
export const STRESSORS = ['workload', 'deadlines', 'clients', 'team', 'interruptions', 'priorities', 'blockers', 'personal', 'none', 'other']
export const ACT_GROUPS = {
  quiet: ['read', 'music', 'journal', 'sit'],
  move: ['walk', 'stretch', 'cycle', 'yoga'],
  attention: ['cook', 'hobby', 'puzzle', 'tidy'],
  connect: ['call', 'people', 'pet'],
  rest: ['bath', 'early', 'nothing']
}
export const ACTS = Object.values(ACT_GROUPS).flat()
export const CUES = ['both', 'sound', 'vibrate', 'none']
export const MAX_CHECKINS = 1000
export const NOTE_MAX = 200, OWN_MAX = 40
export const REMIND_DAYS = 14           // one-shot reminders scheduled ahead
export const REMIND_ID0 = 200            // notification ids 200..213 (workout reminder uses 100..106)

export const PREFS_DEF = Object.freeze({
  days: [1, 2, 3, 4, 5], end: '17:30', remind: false, cue: 'both',
  skip: null, nudged: null, lowShown: null, askedUseful: 0, cleared: null, deleted: []
})

const ISO = /^\d{4}-\d{2}-\d{2}$/
const realDate = d => typeof d === 'string' && ISO.test(d) && isoOf(new Date(d + 'T12:00:00')) === d
const plain = o => o && typeof o === 'object' && !Array.isArray(o)
const str = (v, n) => typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined
const oneOf = (v, list) => list.includes(v) ? v : undefined
const rating = v => Number.isInteger(v) && v >= 1 && v <= 10 ? v : undefined
const drop = o => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o }

// One entry from a backup or another build, rebuilt field by field: unknown keys never survive.
export function cleanEntry(e) {
  if (!plain(e) || !realDate(e.d)) return null
  const at = Number.isFinite(+e.at) && +e.at > 0 ? +e.at : new Date(e.d + 'T12:00:00').getTime()
  const act = e.act === 'own' || ACTS.includes(e.act) ? e.act : undefined
  const out = drop({
    id: e.d, d: e.d, at,
    breath: oneOf(e.breath, ['box', 'natural']),
    mood: oneOf(e.mood, MOODS),
    energy: rating(e.energy), patience: rating(e.patience),
    stress: oneOf(e.stress, STRESSORS),
    note: str(e.note, NOTE_MAX),
    act, actOwn: act === 'own' ? str(e.actOwn, OWN_MAX) : undefined,
    useful: oneOf(e.useful, ['yes', 'no'])
  })
  if (out.act === 'own' && !out.actOwn) delete out.act
  if (plain(e.later) && str(e.later.concern, NOTE_MAX)) out.later = drop({ concern: str(e.later.concern, NOTE_MAX), next: str(e.later.next, NOTE_MAX) })
  if (plain(e.outcome) && ['yes', 'partly', 'no'].includes(e.outcome.happened)) {
    out.outcome = { happened: e.outcome.happened }
    if (e.outcome.happened !== 'no' && ['yes', 'little', 'no'].includes(e.outcome.helped)) out.outcome.helped = e.outcome.helped
  }
  return out
}

// The whole list: one entry per day (the later save wins), oldest first, newest 1000 kept.
export function cleanCheckins(list) {
  if (!Array.isArray(list)) return []
  const byDay = new Map()
  for (const raw of list) {
    const e = cleanEntry(raw)
    if (e && (!byDay.has(e.d) || e.at >= byDay.get(e.d).at)) byDay.set(e.d, e)
  }
  return [...byDay.values()].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-MAX_CHECKINS)
}

export function cleanCheckinPrefs(p) {
  const o = plain(p) ? p : {}
  const days = Array.isArray(o.days) ? [...new Set(o.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [...PREFS_DEF.days]
  return {
    days,
    end: typeof o.end === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.end) ? o.end : PREFS_DEF.end,
    remind: o.remind === true,
    cue: oneOf(o.cue, CUES) || PREFS_DEF.cue,
    skip: realDate(o.skip) ? o.skip : null,
    nudged: typeof o.nudged === 'string' && /^\d{4}-\d{2}$/.test(o.nudged) ? o.nudged : null,
    lowShown: realDate(o.lowShown) ? o.lowShown : null,
    askedUseful: Number.isInteger(o.askedUseful) && o.askedUseful >= 0 ? o.askedUseful : 0,
    cleared: Number.isFinite(+o.cleared) && +o.cleared > 0 ? +o.cleared : null,
    deleted: Array.isArray(o.deleted) ? [...new Set(o.deleted.filter(realDate))].slice(-MAX_CHECKINS) : []
  }
}

export const doneOn = (checkins, iso) => (checkins || []).some(c => c.d === iso)

const endOn = (iso, end) => { const [y, m, d] = iso.split('-').map(Number), [hh, mm] = end.split(':').map(Number); return new Date(y, m - 1, d, hh, mm) }

// Is today a workday whose end time has passed, with no check-in yet? (Home's Wind down card)
export function checkinDue(S, now = new Date()) {
  const p = S.checkinPrefs || PREFS_DEF, iso = isoOf(now)
  return p.days.includes(now.getDay()) && now >= endOn(iso, p.end) && !doneOn(S.checkins, iso)
}

// One-shot reminders for the next 14 days: workdays only, at the local end time (wall clock, so DST
// is right), never for a day that already has a check-in or was skipped, never in the past.
export function checkinSchedule(prefs, checkins, now = new Date()) {
  const p = cleanCheckinPrefs(prefs)
  if (!p.remind || !p.days.length) return []
  const out = []
  for (let k = 0; k < REMIND_DAYS; k++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 12)
    const iso = isoOf(day), at = endOn(iso, p.end)
    if (!p.days.includes(day.getDay()) || at <= now || iso === p.skip || doneOn(checkins, iso)) continue
    out.push({ id: REMIND_ID0 + k, at, day: iso })
  }
  return out
}

// The latest entry before today (Friday's shows on Monday; not just "yesterday")
const lastBefore = (checkins, today) => [...(checkins || [])].filter(c => c.d < today).sort((a, b) => (a.d < b.d ? 1 : -1))[0] || null
export const carriedNote = (checkins, today) => lastBefore(checkins, today)?.later || null
export function followUpTarget(checkins, today) {
  const e = lastBefore(checkins, today)
  return e && e.act && !e.outcome ? e : null
}

// Up to 4 most used activities in the last 30 entries (computed, never stored)
export function recentActivities(checkins) {
  const n = new Map()
  for (const c of (checkins || []).slice(-30)) if (c.act && c.act !== 'own') n.set(c.act, (n.get(c.act) || 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a]) => a)
}

// D3: the last 3 check-ins, all within 10 days, each very low (energy <= 2, or feeling low or
// overwhelmed). At most once every 14 days.
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5)
export function lowMoodDue(checkins, prefs, today) {
  const last3 = [...(checkins || [])].sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-3)
  if (last3.length < 3 || daysBetween(last3[0].d, today) > 10) return false
  if (!last3.every(c => (c.energy != null && c.energy <= 2) || c.mood === 'low' || c.mood === 'overwhelmed')) return false
  const shown = prefs?.lowShown
  return !shown || daysBetween(shown, today) >= 14
}

// Backup nudge: once a calendar month, from the 5th check-in on
export const nudgeDue = (checkins, prefs, today) => (checkins || []).length >= 5 && prefs?.nudged !== today.slice(0, 7)
// "Was this useful?": on the 3rd check-in, then every 10th
export function usefulDue(checkins, prefs) {
  const n = (checkins || []).length, asked = prefs?.askedUseful || 0
  return n >= 3 && (asked === 0 || n - asked >= 10)
}

// Sync with the user's own server: union by day, then drop what was deleted on any device
// (single deletes by day, "delete all" by time), so deleted notes never come back.
export function mergeCheckins(local = [], remote = [], lp = {}, rp = {}) {
  const deleted = new Set([...(lp.deleted || []), ...(rp.deleted || [])])
  const cleared = Math.max(lp.cleared || 0, rp.cleared || 0)
  const merged = cleanCheckins([...(remote || []), ...(local || [])])
  return merged.filter(c => !deleted.has(c.d) && c.at > cleared)
}

// Box breathing: 4 rounds of in/hold/out/hold, 4 s each (64 s). Natural: one quiet minute.
export const BOX = { phases: ['in', 'hold', 'out', 'hold2'], sec: 4, rounds: 4 }
export function breathPlan(kind) {
  if (kind === 'natural') return [{ at: 0, phase: 'natural', round: 1 }, { at: 60, phase: 'end', round: 1 }]
  const out = []
  for (let r = 0; r < BOX.rounds; r++) BOX.phases.forEach((phase, i) => out.push({ at: (r * 4 + i) * BOX.sec, phase, round: r + 1 }))
  out.push({ at: BOX.rounds * 4 * BOX.sec, phase: 'end', round: BOX.rounds })
  return out
}
// Where the exercise is at `elapsed` seconds (the text countdown re-reads this; a slow timer only delays it)
export function breathAt(plan, elapsed) {
  let cur = plan[0]
  for (const s of plan) if (s.at <= elapsed) cur = s
  const next = plan.find(s => s.at > elapsed)
  return { ...cur, left: next ? Math.ceil(next.at - elapsed) : 0, done: cur.phase === 'end' }
}
// One navigator.vibrate pattern for the whole exercise: a short pulse at every phase change
export function vibratePattern(plan, pulse = 60) {
  const out = []; let t = 0
  for (const s of plan) { const gap = Math.max(0, s.at * 1000 - t); if (out.length) out.push(gap); else if (gap) out.push(0, gap); out.push(pulse); t = s.at * 1000 + pulse }
  return out
}
