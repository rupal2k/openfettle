import { describe, it, expect } from 'vitest'
import { tipsFor, flagsOf, activeMinutes, reasonsShown, WEEK_TARGET, MAX_TIPS } from './move.js'

const TODAY = '2026-11-26'
const day = n => { const d = new Date(TODAY + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
let n = 0
const r = (inst, a, ago = 1, extra = {}) => ({ id: inst + ++n, inst, d: day(ago), at: Date.now() - ago * 864e5, a, ...extra })
const W = (ago, min, sets = []) => ({ d: day(ago), start: 0, end: min * 6e4, entries: [{ id: 'x', sets }] })
const ids = o => o.tips.map(t => t.id)
// WHO-5 answers are option positions, best first: 0 = 'All of the time' (5 points)
const LOW = [4, 4, 4, 4, 4], FINE = [0, 0, 0, 0, 0]

const PHQ = total => { const a = Array(9).fill(0); for (let i = 0; i < 8 && total > 0; i++) { a[i] = Math.min(3, total); total -= a[i] } return a }
const GAD = total => { const a = Array(7).fill(0); for (let i = 0; i < 7 && total > 0; i++) { a[i] = Math.min(3, total); total -= a[i] } return a }

describe('activeMinutes', () => {
  it('sums finished workouts of the last 7 days, capped at 4 h each', () => {
    expect(activeMinutes([W(0, 30), W(6, 45), W(7, 60), W(-1, 20)], TODAY)).toBe(75)   // 7 days ago and tomorrow don't count
    expect(activeMinutes([W(1, 600)], TODAY)).toBe(240)
    expect(activeMinutes([{ d: day(1), start: 5, end: 0 }, ...[]], TODAY)).toBe(0)        // unfinished
    expect(activeMinutes(undefined, TODAY)).toBe(0)
  })
})

describe('flagsOf', () => {
  it('reads the latest result of each check, only while fresh', () => {
    expect(flagsOf([r('phq9', PHQ(12), 100)], TODAY).mood).toBe(false)                      // 100 days old
    expect(flagsOf([r('phq9', PHQ(12), 30), r('phq9', PHQ(2), 2)], TODAY).mood).toBe(false)  // the newer one is fine
    expect(flagsOf([r('who5', LOW)], TODAY).mood).toBe(true)                                // WHO-5 20/100
    expect(flagsOf([r('gad7', GAD(5))], TODAY).anxiety).toBe(true)
    expect(flagsOf([r('gad7', GAD(4))], TODAY).anxiety).toBe(false)
  })
})

describe('tipsFor', () => {
  const tips = (selfchecks, workouts = []) => tipsFor({ selfchecks, workouts, today: TODAY })
  it('nothing without results', () => expect(tips([])).toEqual({ tips: [], gentle: false, mental: false, minutes: 0 }))

  it('severe low mood: gentle only, support first', () => {
    const o = tips([r('phq9', PHQ(21)), r('idrs', [2, 2, 2, 2])])
    expect(o.gentle).toBe(true)
    expect(ids(o)).toEqual(['gentle-walk', 'mobility'])   // no targets, even with a diabetes risk
  })
  it('a self-harm answer counts as severe whatever the total', () => {
    const a = Array(9).fill(0); a[8] = 1
    expect(tips([r('phq9', a)]).gentle).toBe(true)
  })

  it('low mood: walk, strength, mobility', () => {
    const o = tips([r('phq9', PHQ(12))])
    expect(ids(o)).toEqual(['walk', 'strength', 'mobility'])
    expect(o.mental).toBe(true)
  })
  it('low mood but already 150+ minutes: keep moving instead of a walk target', () => {
    expect(ids(tips([r('who5', LOW)], [W(1, 80), W(3, 80)]))[0]).toBe('keep-moving')
    expect(WEEK_TARGET).toBe(150)
  })
  it('low mood and training on 6+ of 7 days: a rest day, not more', () => {
    const daily = [0, 1, 2, 3, 4, 5].map(a => W(a, 60))
    expect(ids(tips([r('phq9', PHQ(10))], daily))[0]).toBe('rest')
  })

  it('anxiety: breathing first, then walking and mobility', () => {
    expect(ids(tips([r('gad7', GAD(8))]))).toEqual(['breathing', 'walk', 'mobility'])
  })
  it('diabetes risk: walking and strength, not mental-health tips', () => {
    const o = tips([r('idrs', [2, 2, 1, 0])])   // 30 + 20 + 20 = moderate or above
    expect(ids(o)).toEqual(['walk', 'strength'])
    expect(o.mental).toBe(false)
  })
  it('risky drinking: an evening routine', () => {
    expect(ids(tips([r('auditc', [4, 4, 4], 1, { sex: 'm' })]))).toEqual(['evening'])
  })
  it('all fine: keep it up, plus strength when none was logged in 14 days', () => {
    expect(ids(tips([r('who5', FINE)]))).toEqual(['keep', 'strength'])
    expect(ids(tips([r('who5', FINE)], [W(3, 40, [{ w: 20, r: 8, done: true }])]))).toEqual(['keep'])
  })

  it('merges duplicates, keeps every reason, most serious first, at most 3', () => {
    const o = tips([r('phq9', PHQ(12)), r('gad7', GAD(8)), r('idrs', [2, 2, 1, 0]), r('auditc', [4, 4, 4], 1, { sex: 'm' })])
    expect(o.tips.length).toBe(MAX_TIPS)
    expect(ids(o)).toEqual(['walk', 'strength', 'mobility'])
    expect(o.tips[0].why).toEqual(['mood', 'anxiety', 'diabetes'])
  })
})

describe('reasonsShown', () => {
  const walk = { id: 'walk', why: ['mood', 'diabetes'] }
  it('English shows every reason', () => expect(reasonsShown(walk, 'en')).toEqual(['mood', 'diabetes']))
  it('other languages drop mental-health reasons until reviewed', () => {
    expect(reasonsShown(walk, 'hi')).toEqual(['diabetes'])
    expect(reasonsShown({ id: 'breathing', why: ['anxiety'] }, 'de')).toEqual([])
  })
})
