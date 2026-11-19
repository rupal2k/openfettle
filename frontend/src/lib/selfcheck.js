// Self-checks (docs/specs/2026-11-19-self-checks.md): published questionnaires, their scoring, backup
// cleaning and sync. Pure functions only; the screens are in selfcheck-sheets.jsx.
// WHO-5 and AUDIT-C keep their validated English wording verbatim (rewording changes what a score
// means), so their text is not passed through t(). Entries store answer indices, never text.
import { isoOf } from './format.js'

const EVERY = ['All of the time', 'Most of the time', 'More than half of the time', 'Less than half of the time', 'Some of the time', 'At no time']
const desc = labels => labels.map((label, i) => ({ label, pts: labels.length - 1 - i }))   // first option scores highest
const asc = labels => labels.map((label, i) => ({ label, pts: i }))
const FREQ = asc(['Not at all', 'Several days', 'More than half the days', 'Nearly every day'])
const PFIZER = 'Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.'

export const INSTRUMENTS = {
  // World Health Organization. The WHO-5. Geneva: WHO; 2024. CC BY-NC-SA 3.0 IGO.
  who5: {
    name: 'WHO-5 Well-Being Index', verbatim: true, everyDays: 14, max: 25, mental: true,
    intro: 'Please indicate for each of the five statements which is closest to how you have been feeling over the last two weeks. Notice that higher numbers mean better well-being.',
    items: [
      'I have felt cheerful and in good spirits',
      'I have felt calm and relaxed',
      'I have felt active and vigorous',
      'I woke up feeling fresh and rested',
      'My daily life has been filled with things that interest me'
    ].map(q => ({ q, opts: desc(EVERY) })),
    source: 'World Health Organization. The World Health Organization-Five Well-Being Index (WHO-5). Geneva: WHO; 2024. Licence: CC BY-NC-SA 3.0 IGO.',
    url: 'https://cdn.who.int/media/docs/default-source/mental-health/who-5_english-original4da539d6ed4b49389e3afe47cda2326a.pdf'
  },
  // PHQ-9 and GAD-7 wording from the Pfizer forms ("No permission required..."). Its unscored 10th (difficulty) question is left out.
  // Item 9 is about self-harm: any answer above "Not at all" shows support first (selfHarm below).
  phq9: {
    name: 'PHQ-9', verbatim: true, everyDays: 14, max: 27, mental: true,
    intro: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
    items: [
      'Little interest or pleasure in doing things',
      'Feeling down, depressed, or hopeless',
      'Trouble falling or staying asleep, or sleeping too much',
      'Feeling tired or having little energy',
      'Poor appetite or overeating',
      'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
      'Trouble concentrating on things, such as reading the newspaper or watching television',
      'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
      'Thoughts that you would be better off dead or of hurting yourself in some way'
    ].map(q => ({ q, opts: FREQ })),
    source: 'Kroenke K, Spitzer RL, Williams JB. The PHQ-9. J Gen Intern Med. 2001;16(9):606-13. ' + PFIZER,
    url: 'https://www.phqscreeners.com/select-screener'
  },
  gad7: {
    name: 'GAD-7', verbatim: true, everyDays: 14, max: 21, mental: true,
    intro: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
    items: [
      'Feeling nervous, anxious or on edge',
      'Not being able to stop or control worrying',
      'Worrying too much about different things',
      'Trouble relaxing',
      'Being so restless that it is hard to sit still',
      'Becoming easily annoyed or irritable',
      'Feeling afraid as if something awful might happen'
    ].map(q => ({ q, opts: FREQ })),
    source: 'Spitzer RL, Kroenke K, Williams JB, Löwe B. The GAD-7. Arch Intern Med. 2006;166(10):1092-7. ' + PFIZER,
    url: 'https://www.phqscreeners.com/select-screener'
  },
  // AUDIT questions 1-3 (WHO AUDIT manual, 2001). WHO: free to reproduce, not for sale.
  auditc: {
    name: 'AUDIT-C', verbatim: true, everyDays: 0, max: 12, needsSex: true,
    items: [
      { q: 'How often do you have a drink containing alcohol?', opts: asc(['Never', 'Monthly or less', '2 to 4 times a month', '2 to 3 times a week', '4 or more times a week']) },
      { q: 'How many drinks containing alcohol do you have on a typical day when you are drinking?', opts: asc(['1 or 2', '3 or 4', '5 or 6', '7, 8, or 9', '10 or more']) },
      { q: 'How often do you have six or more drinks on one occasion?', opts: asc(['Never', 'Less than monthly', 'Monthly', 'Weekly', 'Daily or almost daily']) }
    ],
    source: 'Babor TF et al. AUDIT: The Alcohol Use Disorders Identification Test, 2nd ed. Geneva: WHO; 2001. Cut-offs: Bradley KA et al. Alcohol Clin Exp Res. 2007;31(7):1208-17.',
    url: 'https://www.who.int/publications/i/item/who-msd-msb-01.6a'
  },
  // A risk score, not a fixed-wording questionnaire: its categories are translated (t() keys below).
  idrs: {
    name: 'Indian Diabetes Risk Score', verbatim: false, everyDays: 0, max: 100, needsSex: true,
    items: [
      { q: 'Your age', opts: [['Under 35', 0], ['35 to 49', 20], ['50 or older', 30]] },
      { q: 'Your waist', waist: true, opts: [['Below the lower band', 0], ['Between the bands', 10], ['At or above the upper band', 20]] },
      // the original three levels (0/20/30); some later studies split it into four, which is not this score
      { q: 'How active are you?', opts: [['Regular exercise and strenuous (manual) work', 0], ['Regular exercise or strenuous (manual) work, not both', 20], ['No exercise and sitting (sedentary) work', 30]] },
      { q: 'Do your parents have diabetes?', opts: [['Neither parent', 0], ['One parent', 10], ['Both parents', 20]] }
    ].map(it => ({ ...it, opts: it.opts.map(([label, pts]) => ({ label, pts })) })),
    source: 'Mohan V, Deepa R, Deepa M, Somannavar S, Datta M. A simplified Indian Diabetes Risk Score for screening for undiagnosed diabetic subjects. J Assoc Physicians India. 2005;53:759-63.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/16334618/'
  }
}
export const INST_IDS = Object.keys(INSTRUMENTS)

// IDRS waist bands in cm (women 80/90, men 90/100) -> the answer index for the waist item
export const WAIST_BANDS = { f: [80, 90], m: [90, 100] }
export const waistIndex = (cm, sex) => { const [lo, hi] = WAIST_BANDS[sex] || WAIST_BANDS.f; return cm < lo ? 0 : cm < hi ? 1 : 2 }
export const ageIndex = age => age < 35 ? 0 : age < 50 ? 1 : 2
// The profile has only a birth year, so the age is this or one less: prefill only when both fall in one band
export const ageFromYear = (birthYear, year) => { const a = year - birthYear; return birthYear && ageIndex(a) === ageIndex(a - 1) ? ageIndex(a) : null }
// AUDIT-C: someone who never drinks skips questions 2 and 3 (they score 0)
export const skipped = (inst, answers, i) => inst === 'auditc' && i > 0 && answers[0] === 0

export function score(inst, answers) {
  const I = INSTRUMENTS[inst]
  return I.items.reduce((s, it, i) => s + (skipped(inst, answers, i) ? 0 : it.opts[answers[i]]?.pts ?? 0), 0)
}
// AUDIT-C positive screen: 4+ for men, 3+ for women (Bradley 2007)
export const AUDIT_CUT = { m: 4, f: 3 }

// level: 'good' | 'mid' | 'high' (as lib/labs/scores.js); code picks the result text in the sheet
export function band(e) {
  const s = score(e.inst, e.a)
  if (e.inst === 'who5') return s * 4 < 50 ? { code: 'low', level: 'high' } : { code: 'ok', level: 'good' }
  // PHQ-9 / GAD-7: cut points 5, 10, 15 (and 20 for PHQ-9); 10+ is the manual's "yellow flag"
  if (e.inst === 'phq9' || e.inst === 'gad7') {
    const code = s < 5 ? 'minimal' : s < 10 ? 'mild' : s < 15 ? 'moderate' : e.inst === 'phq9' && s < 20 ? 'modsevere' : 'severe'
    return { code, level: s < 5 ? 'good' : s < 10 ? 'mid' : 'high' }
  }
  if (e.inst === 'auditc') return e.a[0] === 0 ? { code: 'none', level: 'good' } : s >= AUDIT_CUT[e.sex || 'f'] ? { code: 'over', level: 'high' } : { code: 'under', level: 'good' }
  return s < 30 ? { code: 'low', level: 'good' } : s < 60 ? { code: 'moderate', level: 'mid' } : { code: 'high', level: 'high' }
}
// PHQ-9 item 9 (thoughts of being better off dead or of self-harm) answered above "Not at all"
export const selfHarm = (inst, answers) => inst === 'phq9' && answers[8] > 0
// What the result screen shows as the number: WHO-5 as a percentage (raw x 4, 0-100)
export const shown = e => e.inst === 'who5' ? score(e.inst, e.a) * 4 : score(e.inst, e.a)

// Where the user lives sets the helplines and drink examples (never which checks exist).
export const IN_ZONES = ['Asia/Kolkata', 'Asia/Calcutta']
export function regionOf(prefs, tz = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return prefs?.region === 'in' || prefs?.region === 'intl' ? prefs.region : IN_ZONES.includes(tz) ? 'in' : 'intl'
}

export const lastOf = (list, inst) => (list || []).filter(e => e.inst === inst).sort((a, b) => a.at - b.at).at(-1) || null
const days = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5)
// The two-weekly checks are offered again 14 days after the last one (never before the first: no nagging)
export function dueOn(list, inst, today) {
  const n = INSTRUMENTS[inst].everyDays, last = lastOf(list, inst)
  return !!n && !!last && days(last.d, today) >= n
}

/* ------------------------------------------------ backup and sync -- */
export const MAX_SELFCHECKS = 500
export const PREFS_DEF = Object.freeze({ region: null, deleted: [], cleared: null })
const ISO = /^\d{4}-\d{2}-\d{2}$/
const plain = o => o && typeof o === 'object' && !Array.isArray(o)

// One entry rebuilt field by field: an unknown questionnaire, a missing or out-of-range answer drops it.
export function cleanEntry(e) {
  if (!plain(e) || !INSTRUMENTS[e.inst] || typeof e.d !== 'string' || !ISO.test(e.d) || isoOf(new Date(e.d + 'T12:00:00')) !== e.d) return null
  const I = INSTRUMENTS[e.inst], at = Number.isFinite(+e.at) && +e.at > 0 ? +e.at : new Date(e.d + 'T12:00:00').getTime()
  if (!Array.isArray(e.a) || e.a.length !== I.items.length) return null
  if (!e.a.every((v, i) => Number.isInteger(v) && v >= 0 && v < I.items[i].opts.length)) return null
  const out = { id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : e.inst + '-' + at, inst: e.inst, d: e.d, at, a: [...e.a] }
  if (I.needsSex) { if (e.sex !== 'f' && e.sex !== 'm') return null; out.sex = e.sex }
  return out
}
export function cleanSelfchecks(list) {
  const seen = new Map()
  for (const e of (Array.isArray(list) ? list : []).map(cleanEntry).filter(Boolean)) seen.set(e.id, e)
  return [...seen.values()].sort((a, b) => a.at - b.at).slice(-MAX_SELFCHECKS)
}
export function cleanSelfcheckPrefs(p) {
  p = plain(p) ? p : {}
  return {
    region: p.region === 'in' || p.region === 'intl' ? p.region : null,
    deleted: (Array.isArray(p.deleted) ? p.deleted : []).filter(x => typeof x === 'string').slice(-MAX_SELFCHECKS),
    cleared: Number.isFinite(+p.cleared) && +p.cleared > 0 ? +p.cleared : null
  }
}
// Own-server sync: union by id, then drop what either device deleted, so a deleted result never returns
export function mergeSelfchecks(local = [], remote = [], lp = {}, rp = {}) {
  const deleted = new Set([...(lp.deleted || []), ...(rp.deleted || [])])
  const cleared = Math.max(lp.cleared || 0, rp.cleared || 0)
  return cleanSelfchecks([...(remote || []), ...(local || [])]).filter(e => !deleted.has(e.id) && e.at > cleared)
}
