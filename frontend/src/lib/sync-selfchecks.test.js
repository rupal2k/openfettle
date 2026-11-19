import { describe, it, expect } from 'vitest'
import { mergeState } from './sync.js'

const r = (id, at) => ({ id, inst: 'gad7', d: '2026-11-19', at, a: [0, 0, 0, 0, 0, 0, 0] })
describe('mergeState: self-checks', () => {
  it('unions both devices, honours a delete from either, and keeps this device’s region', () => {
    const local = { selfchecks: [r('a', 1), r('b', 2)], selfcheckPrefs: { region: 'in', deleted: ['c'] } }
    const remote = { selfchecks: [r('b', 2), r('c', 3), r('d', 4)], selfcheckPrefs: { region: 'intl', deleted: ['a'], cleared: null } }
    const m = mergeState(local, remote)
    expect(m.selfchecks.map(x => x.id)).toEqual(['b', 'd'])
    expect(m.selfcheckPrefs.deleted.sort()).toEqual(['a', 'c'])
    expect(m.selfcheckPrefs.region).toBe('in')
  })
  it('a "delete all" on one device removes older results the other device still has', () => {
    const m = mergeState({ selfchecks: [], selfcheckPrefs: { cleared: 1000 } }, { selfchecks: [r('old', 500), r('new', 2000)], selfcheckPrefs: {} })
    expect(m.selfchecks.map(x => x.id)).toEqual(['new'])
    expect(m.selfcheckPrefs.cleared).toBe(1000)
  })
  it('a state from before self-checks existed merges cleanly', () => {
    const m = mergeState({ selfchecks: [r('a', 1)] }, {})
    expect(m.selfchecks.map(x => x.id)).toEqual(['a'])
  })
})
