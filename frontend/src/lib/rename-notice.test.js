import { describe, it, expect } from 'vitest'
import { shouldShowRenameNotice, SEEN_KEY } from './rename-notice.js'

const storage = (init = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }
}
const used = { workouts: [{ id: 'w1' }], routines: [], bodyweight: [], nutrition: { days: {} } }
const fresh = { workouts: [], routines: [], bodyweight: [], nutrition: { days: {} } }

describe('rename notice', () => {
  it('shows once to someone who already has data', () => {
    const s = storage()
    expect(shouldShowRenameNotice(used, s)).toBe(true)
    expect(s.m.get(SEEN_KEY)).toBe('1')
    expect(shouldShowRenameNotice(used, s)).toBe(false)
  })
  it('never shows to a new user, and stays quiet later too', () => {
    const s = storage()
    expect(shouldShowRenameNotice(fresh, s)).toBe(false)
    expect(shouldShowRenameNotice(used, s)).toBe(false)  // they never knew the old name
  })
  it('counts routines, weigh-ins, food diary days and lab reports as data', () => {
    for (const st of [{ ...fresh, routines: [{}] }, { ...fresh, bodyweight: [{}] },
      { ...fresh, nutrition: { days: { '2026-11-01': {} } } }, { ...fresh, labs: { reports: [{}] } }]) {
      expect(shouldShowRenameNotice(st, storage())).toBe(true)
    }
  })
  it('stays quiet when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(shouldShowRenameNotice(used, blocked)).toBe(false)
  })
})
