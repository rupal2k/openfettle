// A backup is untrusted input (security audit 1.6.2): shapes that break a screen are dropped,
// good data is kept as it is.
import { describe, it, expect, vi } from 'vitest'
// the store adds a visibilitychange listener when it is created; no DOM library is installed
vi.hoisted(() => { globalThis.document ??= { addEventListener() {}, visibilityState: 'visible' } })
import { normalizeState } from './useStore.js'

describe('normalizeState repairs a hostile backup', () => {
  const bad = {
    customEx: [{ id: '__proto__', n: 'x' }, { id: 'c1', n: { evil: 1 } }, { id: 'c2', n: 'Wall sit', bp: 7, desc: ['x'] }, null],
    workouts: [null, { d: '2026-01-01' }, { d: '2026-01-02', entries: [] }],
    bodyweight: [{ d: '2026-01-01', w: 'heavy' }, { d: '2026-01-02', w: 71.5 }, 'x'],
    nutrition: { profile: ['x'], days: ['x'], foods: [null, { name: 'Apple' }] },
    exWeights: 'nope'
  }
  const s = normalizeState(bad)
  it('keeps only usable custom exercises, never a prototype id', () => {
    expect(s.customEx.map(c => c.id)).toEqual(['c2'])
    expect(s.customEx[0].bp).toBe('')
    expect(s.customEx[0].desc).toBeUndefined()
  })
  it('keeps workouts and weigh-ins that a screen can render', () => {
    expect(s.workouts).toHaveLength(1)
    expect(s.bodyweight).toEqual([{ d: '2026-01-02', w: 71.5 }])
  })
  it('coerces nutrition and working weights to the shapes the app expects', () => {
    expect(s.nutrition.profile).toBeNull()
    expect(s.nutrition.days).toEqual({})
    expect(s.nutrition.foods).toEqual([{ name: 'Apple' }])
    expect(s.exWeights).toEqual({})
  })
  it('leaves a normal state alone', () => {
    const ok = normalizeState({ customEx: [{ id: 'c9', n: 'Plank', bp: 'waist', tg: '', eq: 'custom', custom: true }], bodyweight: [{ d: '2026-01-02', w: 70 }] })
    expect(ok.customEx[0]).toMatchObject({ id: 'c9', n: 'Plank', bp: 'waist', eq: 'custom', custom: true })
    expect(ok.bodyweight).toEqual([{ d: '2026-01-02', w: 70 }])
  })
})

describe('Wind down settings from a backup', () => {
  it('keeps a valid mix and saved mixes, and repairs a broken value', () => {
    const s = normalizeState({ winddown: { mix: { fire: 0.7, night: 2 }, volume: 0.4, mixes: [{ name: 'Rain-ish', mix: { water: 0.5 } }, { name: 'x', mix: 'all' }] } })
    expect(s.winddown.mix).toMatchObject({ fire: 0.7, night: 1, brown: 0 })
    expect(s.winddown.volume).toBe(0.4)
    expect(s.winddown.mixes).toEqual([{ name: 'Rain-ish', mix: expect.objectContaining({ water: 0.5 }) }])
    expect(normalizeState({ winddown: 'loud' }).winddown).toEqual({ mix: null, volume: 0.5, mixes: [] })
    expect(normalizeState({}).winddown).toEqual({ mix: null, volume: 0.5, mixes: [] })   // backups from 1.7.1 and older
  })
})

describe('End-of-day check-ins from a backup', () => {
  it('older backups load with the defaults; entries and prefs are cleaned', () => {
    const s = normalizeState({})
    expect(s.checkins).toEqual([])
    expect(s.checkinPrefs).toMatchObject({ days: [1, 2, 3, 4, 5], end: '17:30', remind: false })
    const t = normalizeState({ checkins: [{ d: '2026-11-18', mood: 'calm', energy: 99, evil: 1 }], checkinPrefs: { end: 'late', remind: true } })
    expect(t.checkins).toEqual([{ id: '2026-11-18', d: '2026-11-18', at: expect.any(Number), mood: 'calm' }])
    expect(t.checkinPrefs).toMatchObject({ end: '17:30', remind: true })
  })
})
