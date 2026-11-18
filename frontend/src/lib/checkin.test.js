import { describe, it, expect } from 'vitest'
import {
  cleanEntry, cleanCheckins, cleanCheckinPrefs, PREFS_DEF, checkinSchedule, checkinDue, doneOn, carriedNote,
  followUpTarget, recentActivities, lowMoodDue, nudgeDue, usefulDue, mergeCheckins, breathPlan, breathAt,
  vibratePattern, MAX_CHECKINS, REMIND_ID0
} from './checkin.js'

const on = (iso, extra = {}) => ({ id: iso, d: iso, at: new Date(iso + 'T18:00:00').getTime(), ...extra })
const prefs = (p = {}) => ({ ...PREFS_DEF, remind: true, ...p })

describe('cleanCheckins (backups are untrusted)', () => {
  it('rebuilds an entry field by field: unknown keys, bad codes and out-of-range ratings are dropped', () => {
    const e = cleanEntry({ d: '2026-11-18', at: 5, mood: 'calm', energy: 11, patience: 3.5, stress: 'boss', note: '  long day  ', hack: 1, act: 'walk', actOwn: 'x' })
    expect(e).toEqual({ id: '2026-11-18', d: '2026-11-18', at: 5, mood: 'calm', note: 'long day', act: 'walk' })
    expect(cleanEntry(JSON.parse('{"d":"2026-11-18","__proto__":{"x":1}}'))).toEqual({ id: '2026-11-18', d: '2026-11-18', at: expect.any(Number) })
  })
  it('refuses impossible dates and non-objects', () => {
    for (const bad of [{ d: '2026-02-30' }, { d: '18/11/2026' }, 'x', null, [], { d: 20261118 }]) expect(cleanEntry(bad)).toBe(null)
  })
  it('truncates long text and keeps "later" only with a concern', () => {
    const e = cleanEntry({ d: '2026-11-18', note: 'a'.repeat(500), later: { concern: '', next: 'x' } })
    expect(e.note).toHaveLength(200); expect(e.later).toBeUndefined()
    expect(cleanEntry({ d: '2026-11-18', later: { concern: 'reply to the client', next: 'call at 10' } }).later).toEqual({ concern: 'reply to the client', next: 'call at 10' })
  })
  it('keeps an own activity only with its text, and "helped" only when it happened', () => {
    expect(cleanEntry({ d: '2026-11-18', act: 'own' }).act).toBeUndefined()
    expect(cleanEntry({ d: '2026-11-18', act: 'own', actOwn: 'Paint' })).toMatchObject({ act: 'own', actOwn: 'Paint' })
    expect(cleanEntry({ d: '2026-11-18', outcome: { happened: 'no', helped: 'yes' } }).outcome).toEqual({ happened: 'no' })
    expect(cleanEntry({ d: '2026-11-18', outcome: { happened: 'maybe' } }).outcome).toBeUndefined()
  })
  it('one entry per day (the later save wins), sorted, capped at 1000', () => {
    const l = cleanCheckins([on('2026-11-18', { at: 1, mood: 'low' }), on('2026-11-17'), on('2026-11-18', { at: 2, mood: 'calm' })])
    expect(l.map(c => c.d)).toEqual(['2026-11-17', '2026-11-18']); expect(l[1].mood).toBe('calm')
    const many = Array.from({ length: 1200 }, (_, i) => on(new Date(2020, 0, 1 + i, 12).toISOString().slice(0, 10)))
    expect(cleanCheckins(many)).toHaveLength(MAX_CHECKINS)
    expect(cleanCheckins('nope')).toEqual([])
  })
  it('prefs: bad values fall back to the defaults', () => {
    expect(cleanCheckinPrefs({ days: [1, 1, 9, 'x', 3], end: '25:00', cue: 'loud', remind: 'yes', skip: '2026-02-30' }))
      .toMatchObject({ days: [1, 3], end: '17:30', cue: 'both', remind: false, skip: null })
    expect(cleanCheckinPrefs(undefined)).toEqual(PREFS_DEF)
  })
})

describe('reminder schedule (one-shots for the next 14 days)', () => {
  const wed = new Date(2026, 10, 18, 9, 0)   // Wednesday 09:00
  it('workdays only, at the end time, ids from 200', () => {
    const s = checkinSchedule(prefs(), [], wed)
    expect(s[0]).toMatchObject({ id: REMIND_ID0, day: '2026-11-18' })
    expect(s[0].at.getHours()).toBe(17); expect(s[0].at.getMinutes()).toBe(30)
    expect(s.every(x => ![0, 6].includes(x.at.getDay()))).toBe(true)
    expect(s).toHaveLength(10)                 // 14 days hold 10 weekdays from a Wednesday
  })
  it('skips today once checked in, once skipped, or once the end time has passed', () => {
    expect(checkinSchedule(prefs(), [on('2026-11-18')], wed)[0].day).toBe('2026-11-19')
    expect(checkinSchedule(prefs({ skip: '2026-11-18' }), [], wed)[0].day).toBe('2026-11-19')
    expect(checkinSchedule(prefs(), [], new Date(2026, 10, 18, 18, 0))[0].day).toBe('2026-11-19')
  })
  it('nothing when the reminder is off or there are no workdays', () => {
    expect(checkinSchedule(prefs({ remind: false }), [], wed)).toEqual([])
    expect(checkinSchedule(prefs({ days: [] }), [], wed)).toEqual([])
  })
  it('keeps the local end time across a DST change (wall clock, not +24 h)', () => {
    const s = checkinSchedule(prefs({ days: [0, 1, 2, 3, 4, 5, 6] }), [], new Date(2026, 2, 20, 9))
    expect(s.every(x => x.at.getHours() === 17 && x.at.getMinutes() === 30)).toBe(true)
  })
  it('checkinDue: a workday after the end time without a check-in', () => {
    const S = { checkinPrefs: prefs(), checkins: [] }
    expect(checkinDue(S, new Date(2026, 10, 18, 17, 0))).toBe(false)
    expect(checkinDue(S, new Date(2026, 10, 18, 17, 30))).toBe(true)
    expect(checkinDue({ ...S, checkins: [on('2026-11-18')] }, new Date(2026, 10, 18, 19))).toBe(false)
    expect(checkinDue(S, new Date(2026, 10, 21, 19))).toBe(false)        // Saturday
    expect(doneOn([on('2026-11-18')], '2026-11-18')).toBe(true)
  })
})

describe('carry-over, follow-up and suggestions', () => {
  const fri = on('2026-11-13', { later: { concern: 'client approval' }, act: 'walk' })
  it('the latest earlier entry, so Friday\'s note shows on Monday', () => {
    expect(carriedNote([fri], '2026-11-16')).toEqual({ concern: 'client approval' })
    expect(followUpTarget([fri], '2026-11-16').d).toBe('2026-11-13')
  })
  it('nothing when that entry has no note or activity, or already has an outcome', () => {
    expect(carriedNote([fri, on('2026-11-15')], '2026-11-16')).toBe(null)
    expect(followUpTarget([{ ...fri, outcome: { happened: 'yes' } }], '2026-11-16')).toBe(null)
    expect(followUpTarget([fri], '2026-11-13')).toBe(null)                // not today's own entry
  })
  it('recent activities: the 4 most used in the last 30 entries', () => {
    const l = ['walk', 'walk', 'read', 'read', 'read', 'cook', 'call', 'yoga', 'own'].map((a, i) => on(`2026-11-0${i + 1}`, { act: a }))
    expect(recentActivities(l)).toEqual(['read', 'walk', 'cook', 'call'])
  })
})

describe('low-mood line, backup nudge, "was this useful?"', () => {
  const low = (d, e = {}) => on(d, { energy: 2, ...e })
  it('three very low check-ins within 10 days', () => {
    expect(lowMoodDue([low('2026-11-10'), low('2026-11-12'), low('2026-11-14')], {}, '2026-11-14')).toBe(true)
    expect(lowMoodDue([low('2026-11-10'), on('2026-11-12', { mood: 'low' }), on('2026-11-14', { mood: 'overwhelmed' })], {}, '2026-11-14')).toBe(true)
  })
  it('not when one of them is ordinary, when they are spread out, or within 14 days of the last time', () => {
    expect(lowMoodDue([low('2026-11-10'), on('2026-11-12', { energy: 6 }), low('2026-11-14')], {}, '2026-11-14')).toBe(false)
    expect(lowMoodDue([low('2026-11-01'), low('2026-11-08'), low('2026-11-14')], {}, '2026-11-14')).toBe(false)
    expect(lowMoodDue([low('2026-11-10'), low('2026-11-12'), low('2026-11-14')], { lowShown: '2026-11-05' }, '2026-11-14')).toBe(false)
    expect(lowMoodDue([low('2026-11-12'), low('2026-11-14')], {}, '2026-11-14')).toBe(false)
  })
  it('backup nudge once a month from the 5th check-in; useful on the 3rd, then every 10th', () => {
    const five = ['01', '02', '03', '04', '05'].map(d => on('2026-11-' + d))
    expect(nudgeDue(five, { nudged: null }, '2026-11-18')).toBe(true)
    expect(nudgeDue(five, { nudged: '2026-11' }, '2026-11-18')).toBe(false)
    expect(nudgeDue(five.slice(0, 4), {}, '2026-11-18')).toBe(false)
    expect(usefulDue(five.slice(0, 3), { askedUseful: 0 })).toBe(true)
    expect(usefulDue(five, { askedUseful: 3 })).toBe(false)
  })
})

describe('sync merge (the user\'s own server): deleted check-ins never come back', () => {
  it('unions by day, newer save wins', () => {
    const m = mergeCheckins([on('2026-11-18', { at: 9, mood: 'calm' })], [on('2026-11-17'), on('2026-11-18', { at: 5, mood: 'low' })])
    expect(m.map(c => c.d)).toEqual(['2026-11-17', '2026-11-18']); expect(m[1].mood).toBe('calm')
  })
  it('drops days deleted on either device, and everything before a "delete all"', () => {
    expect(mergeCheckins([], [on('2026-11-17'), on('2026-11-18')], { deleted: ['2026-11-17'] }).map(c => c.d)).toEqual(['2026-11-18'])
    const cut = new Date('2026-11-18T12:00:00').getTime()
    expect(mergeCheckins([], [on('2026-11-17'), on('2026-11-18')], {}, { cleared: cut }).map(c => c.d)).toEqual(['2026-11-18'])
  })
})

describe('breathing plan', () => {
  it('box breathing: 4 rounds of 4 phases, 4 s each, 64 s in all', () => {
    const p = breathPlan('box')
    expect(p).toHaveLength(17); expect(p.at(-1)).toMatchObject({ at: 64, phase: 'end' })
    expect(breathAt(p, 5)).toMatchObject({ phase: 'hold', left: 3, round: 1 })
    expect(breathAt(p, 63.2)).toMatchObject({ phase: 'hold2', round: 4, left: 1 })
    expect(breathAt(p, 64).done).toBe(true)
  })
  it('natural: one quiet minute', () => {
    const p = breathPlan('natural')
    expect(breathAt(p, 30)).toMatchObject({ phase: 'natural', left: 30 })
    expect(breathAt(p, 60).done).toBe(true)
  })
  it('one vibration pattern covers the whole exercise: a pulse at every phase change', () => {
    const v = vibratePattern(breathPlan('box'), 60)
    expect(v.filter((_, i) => i % 2 === 0)).toHaveLength(17)           // 17 pulses
    expect(v.reduce((a, b) => a + b, 0)).toBe(64 * 1000 + 60)          // ends with the last pulse
    expect(v[1]).toBe(4000 - 60)
  })
})
