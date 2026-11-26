import { describe, it, expect } from 'vitest'
import { INSTRUMENTS, score, band, shown, selfHarm, waistIndex, ageIndex, ageFromYear, regionOf, dueOn, dueChecks, cleanEntry, cleanSelfchecks, cleanSelfcheckPrefs, mergeSelfchecks } from './selfcheck.js'

const e = (inst, a, extra = {}) => ({ id: inst + '-1', inst, d: '2026-11-19', at: 1, a, ...extra })

describe('WHO-5 (WHO 2024 scoring)', () => {
  it('scores 5..0 per item, shown as raw x 4', () => {
    expect(score('who5', [0, 0, 0, 0, 0])).toBe(25)          // "All of the time" everywhere
    expect(shown(e('who5', [5, 5, 5, 5, 5]))).toBe(0)
    expect(shown(e('who5', [2, 2, 2, 2, 2]))).toBe(60)       // "more than half of the time" = 3 each
  })
  it('below 50% (raw below 13) is the published cut-off', () => {
    expect(score('who5', [2, 2, 3, 3, 3])).toBe(12)            // 3+3+2+2+2 -> 48%
    expect(band(e('who5', [2, 2, 3, 3, 3])).code).toBe('low')
    expect(score('who5', [2, 2, 2, 3, 3])).toBe(13)            // -> 52%
    expect(band(e('who5', [2, 2, 2, 3, 3])).code).toBe('ok')
  })
  it('keeps the WHO wording verbatim', () => {
    expect(INSTRUMENTS.who5.items.map(i => i.q)[3]).toBe('I woke up feeling fresh and rested')
    expect(INSTRUMENTS.who5.items[0].opts.map(o => o.pts)).toEqual([5, 4, 3, 2, 1, 0])
  })
})

describe('AUDIT-C', () => {
  it('never drinking scores 0 and skips questions 2 and 3', () => {
    expect(score('auditc', [0, 4, 4])).toBe(0)
    expect(band(e('auditc', [0, 4, 4], { sex: 'm' })).code).toBe('none')
  })
  it('cut-offs: 4+ men, 3+ women', () => {
    const a = [2, 1, 0]                                          // 2 + 1 + 0 = 3
    expect(score('auditc', a)).toBe(3)
    expect(band(e('auditc', a, { sex: 'f' })).code).toBe('over')
    expect(band(e('auditc', a, { sex: 'm' })).code).toBe('under')
    expect(band(e('auditc', [4, 4, 4], { sex: 'm' })).code).toBe('over')
    expect(score('auditc', [4, 4, 4])).toBe(12)
  })
})

describe('Indian Diabetes Risk Score (Mohan 2005)', () => {
  it('maps age and waist to the bands', () => {
    expect([34, 35, 49, 50].map(ageIndex)).toEqual([0, 1, 1, 2])
    expect([79, 80, 89, 90].map(c => waistIndex(c, 'f'))).toEqual([0, 1, 1, 2])
    expect([89, 90, 99, 100].map(c => waistIndex(c, 'm'))).toEqual([0, 1, 1, 2])
  })
  it('scores 0-100 with low <30, moderate 30-50, high 60+', () => {
    expect(score('idrs', [2, 2, 2, 2])).toBe(100)
    expect(INSTRUMENTS.idrs.items[2].opts.map(o => o.pts)).toEqual([0, 20, 30])   // Mohan 2005 activity levels
    expect(score('idrs', [0, 0, 0, 0])).toBe(0)
    expect(band(e('idrs', [1, 0, 0, 0], { sex: 'm' })).code).toBe('low')       // 20
    expect(band(e('idrs', [1, 1, 0, 0], { sex: 'm' })).code).toBe('moderate')  // 30
    expect(band(e('idrs', [1, 1, 1, 0], { sex: 'm' })).code).toBe('moderate')  // 20 + 10 + 20 = 50
    expect(band(e('idrs', [2, 0, 2, 0], { sex: 'm' })).code).toBe('high')      // 30 + 30 = 60
  })
})

describe('region, due, cleaning, sync', () => {
  it('India from the time zone unless chosen', () => {
    expect(regionOf({}, 'Asia/Kolkata')).toBe('in')
    expect(regionOf({}, 'Europe/London')).toBe('intl')
    expect(regionOf({ region: 'intl' }, 'Asia/Kolkata')).toBe('intl')
  })
  it('WHO-5 is due again after 14 days; one-off checks never nag', () => {
    const list = [e('who5', [0, 0, 0, 0, 0], { d: '2026-11-01' })]
    expect(dueOn([], 'who5', '2026-11-19')).toBe(false)              // not before the first one
    expect(dueOn(list, 'who5', '2026-11-14')).toBe(false)
    expect(dueOn(list, 'who5', '2026-11-15')).toBe(true)
    expect(dueOn([], 'idrs', '2026-11-19')).toBe(false)
  })
  it('drops bad entries from a backup', () => {
    expect(cleanEntry(e('who5', [0, 0, 0, 0]))).toBe(null)             // too few answers
    expect(cleanEntry(e('who5', [0, 0, 0, 0, 6]))).toBe(null)          // out of range
    expect(cleanEntry(e('auditc', [1, 1, 1]))).toBe(null)              // no sex for the cut-off
    expect(cleanEntry(e('nope', [0]))).toBe(null)
    expect(cleanEntry({ ...e('who5', [0, 0, 0, 0, 0]), d: '2026-02-30' })).toBe(null)
    expect(cleanEntry({ ...e('who5', [0, 0, 0, 0, 0]), note: 'x' })).not.toHaveProperty('note')
    expect(cleanSelfchecks('junk')).toEqual([])
    expect(cleanSelfcheckPrefs({ region: 'mars', deleted: [1, 'a'] })).toEqual({ region: null, deleted: ['a'], cleared: null })
  })
  it('sync: union, and a delete on either device wins', () => {
    const a = e('who5', [0, 0, 0, 0, 0], { id: 'a', at: 10 }), b = e('who5', [1, 1, 1, 1, 1], { id: 'b', at: 20 })
    expect(mergeSelfchecks([a], [b]).map(x => x.id)).toEqual(['a', 'b'])
    expect(mergeSelfchecks([a], [a, b], {}, { deleted: ['a'] }).map(x => x.id)).toEqual(['b'])
    expect(mergeSelfchecks([a], [b], { cleared: 15 }).map(x => x.id)).toEqual(['b'])
  })
})

describe('PHQ-9 and GAD-7 (Pfizer manual cut points)', () => {
  const z = n => Array(n).fill(0)
  it('scores 0..3 per item; PHQ-9 bands at 5, 10, 15, 20', () => {
    expect(score('phq9', Array(9).fill(3))).toBe(27)
    const at = s => band(e('phq9', Array.from({ length: 9 }, (_, i) => Math.max(0, Math.min(3, s - 3 * i))))).code   // a total of s
    expect([4, 5, 9, 10, 14, 15, 19, 20, 27].map(at)).toEqual(['minimal', 'mild', 'mild', 'moderate', 'moderate', 'modsevere', 'modsevere', 'severe', 'severe'])
    expect(band(e('phq9', [3, 3, 3, 1, 0, 0, 0, 0, 0])).level).toBe('high')   // 10 = the yellow flag
  })
  it('GAD-7 bands at 5, 10, 15 (no moderately severe)', () => {
    expect(score('gad7', Array(7).fill(3))).toBe(21)
    expect(band(e('gad7', [3, 3, 3, 3, 3, 0, 0])).code).toBe('severe')       // 15
    expect(band(e('gad7', [3, 3, 3, 0, 0, 0, 0])).code).toBe('mild')         // 9
    expect(band(e('gad7', [3, 3, 3, 1, 0, 0, 0])).code).toBe('moderate')     // 10
  })
  it('item 9 above "Not at all" is flagged whatever the total', () => {
    expect(selfHarm('phq9', [...z(8), 1])).toBe(true)
    expect(band(e('phq9', [...z(8), 1])).code).toBe('minimal')
    expect(selfHarm('phq9', [...Array(8).fill(3), 0])).toBe(false)
    expect(selfHarm('gad7', Array(7).fill(3))).toBe(false)
    expect(INSTRUMENTS.phq9.items[8].q).toBe('Thoughts that you would be better off dead or of hurting yourself in some way')
  })
  it('cleaning keeps them without sex and drops a wrong length', () => {
    expect(cleanEntry(e('phq9', z(9)))).toMatchObject({ inst: 'phq9', a: z(9) })
    expect(cleanEntry(e('gad7', z(6)))).toBe(null)
    expect(cleanEntry(e('gad7', [...z(6), 4]))).toBe(null)
  })
})

describe('age from the profile birth year', () => {
  it('prefills only when the age band is certain', () => {
    expect(ageFromYear(1990, 2026)).toBe(1)      // 35 or 36 -> 35-49
    expect(ageFromYear(1991, 2026)).toBe(null)   // 34 or 35: either band
    expect(ageFromYear(1976, 2026)).toBe(null)   // 49 or 50
    expect(ageFromYear(1960, 2026)).toBe(2)
    expect(ageFromYear(null, 2026)).toBe(null)
  })
})

describe('dueChecks (Home card)', () => {
  it('lists only the two-weekly checks taken 14+ days ago', () => {
    const list = [e('who5', [0, 0, 0, 0, 0], { d: '2026-11-01' }), e('phq9', Array(9).fill(0), { d: '2026-11-10' }), e('idrs', [0, 0, 0, 0], { d: '2026-01-01' })]
    expect(dueChecks(list, '2026-11-15')).toEqual(['who5'])
    expect(dueChecks(list, '2026-11-24')).toEqual(['who5', 'phq9'])
    expect(dueChecks(undefined, '2026-11-24')).toEqual([])
  })
})
