import { describe, it, expect } from 'vitest'
import { mergeState } from './sync.js'

const c = (d, at) => ({ id: d, d, at })
describe('mergeState: check-ins', () => {
  it('unions both devices and keeps every delete, from either side', () => {
    const local = { checkins: [c('2026-11-18', 5)], checkinPrefs: { deleted: ['2026-11-16'] } }
    const remote = { checkins: [c('2026-11-16', 4), c('2026-11-17', 4)], checkinPrefs: { deleted: ['2026-11-17'], cleared: null } }
    const m = mergeState(local, remote)
    expect(m.checkins.map(x => x.d)).toEqual(['2026-11-18'])
    expect(m.checkinPrefs.deleted.sort()).toEqual(['2026-11-16', '2026-11-17'])
  })
  it('a "delete all" on one device removes the older entries the other device still has', () => {
    const cut = 1000
    const m = mergeState({ checkins: [], checkinPrefs: { cleared: cut } }, { checkins: [c('2026-11-10', 500), c('2026-11-18', 2000)], checkinPrefs: {} })
    expect(m.checkins.map(x => x.d)).toEqual(['2026-11-18'])
    expect(m.checkinPrefs.cleared).toBe(cut)
  })
})
