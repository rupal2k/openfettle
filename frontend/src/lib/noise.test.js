import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fillNoise, loopNoise, createNoisePlayer, FADE, SLEEP_FADE } from './noise.js'

const rmsDb = x => { let e = 0; for (const v of x) e += v * v; return 10 * Math.log10(e / x.length) }

// seeded so the spectral checks never flake
const rng = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
// first-difference energy over signal energy: ~2 for white, smaller the more low-frequency weight
const diffRatio = x => {
  let d = 0, e = 0
  for (let i = 1; i < x.length; i++) { d += (x[i] - x[i - 1]) ** 2; e += x[i] ** 2 }
  return d / e
}

describe('noise generators', () => {
  for (const c of ['white', 'pink', 'brown']) {
    it(`${c} stays in [-1, 1] and is not silent`, () => {
      const x = fillNoise(c, new Float32Array(48000), rng(7))
      expect(x.every(v => v >= -1 && v <= 1)).toBe(true)
      expect(x.some(v => Math.abs(v) > 0.05)).toBe(true)
    })
  }
  it('tilts toward low frequencies: white > pink > brown', () => {
    const r = c => diffRatio(fillNoise(c, new Float32Array(48000), rng(3)))
    const w = r('white'), p = r('pink'), b = r('brown')
    expect(w).toBeGreaterThan(1.8)
    expect(p).toBeLessThan(w * 0.8)
    expect(b).toBeLessThan(p * 0.5)
  })
  it('all three colours play at about the same loudness', () => {
    const db = ['white', 'pink', 'brown'].map(c => rmsDb(fillNoise(c, new Float32Array(48000 * 20), rng(11))))
    expect(Math.max(...db) - Math.min(...db)).toBeLessThan(1.5)
  })
  it('the loop seam keeps its level (equal-power blend)', () => {
    const n = 48000, x = loopNoise('white', n, rng(9))
    const seam = rmsDb(x.subarray(0, 2048)), rest = rmsDb(x.subarray(10000, 40000))
    expect(Math.abs(seam - rest)).toBeLessThan(1)
  })
  it('loops without a jump at the seam', () => {
    const x = loopNoise('brown', 48000, rng(5))
    expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThan(0.05)
  })
})

// AudioContext mocked at the boundary only
function fakeContext() {
  const param = { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(v => { param.target = v }) }
  const sources = []
  const ctx = {
    sampleRate: 8000, currentTime: 0, destination: {}, state: 'running', onstatechange: null,
    resume: vi.fn(() => Promise.resolve()),
    createGain: () => ({ gain: param, connect: vi.fn() }),
    createBuffer: (ch, n) => ({ length: n, copyToChannel: vi.fn() }),
    createBufferSource: () => { const s = { connect: vi.fn(), start: vi.fn(), stop: vi.fn() }; sources.push(s); return s },
    close: vi.fn(() => Promise.resolve()),
    param, sources
  }
  return ctx
}

describe('noise player', () => {
  let ctxs, p
  beforeEach(() => {
    vi.useFakeTimers()
    ctxs = []
    p = createNoisePlayer({ newContext: () => { const c = fakeContext(); ctxs.push(c); return c } })
  })
  afterEach(() => vi.useRealTimers())

  it('fades in on play', () => {
    p.setVolume(0.7); p.play()
    expect(p.get().playing).toBe(true)
    const { param, sources } = ctxs[0]
    expect(sources[0].loop).toBe(true)
    expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.7, FADE)
  })

  it('stop() fades out, then stops the source and closes the context', () => {
    p.play(); p.stop()
    const c = ctxs[0]
    expect(p.get().playing).toBe(false)
    expect(c.param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, FADE)
    expect(c.close).not.toHaveBeenCalled()          // still fading
    vi.advanceTimersByTime(FADE * 1000 + 60)
    expect(c.sources[0].stop).toHaveBeenCalled()
    expect(c.close).toHaveBeenCalledTimes(1)
  })

  it('sleep timer fades out and stops after the chosen minutes', () => {
    p.setSleep(15); p.play()
    expect(p.get().endsAt).toBe(Date.now() + 15 * 60000)
    vi.advanceTimersByTime(15 * 60000 - 1)
    expect(p.get().playing).toBe(true)
    vi.advanceTimersByTime(1)
    expect(p.get().playing).toBe(false)
    expect(ctxs[0].param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, SLEEP_FADE)
    vi.advanceTimersByTime(SLEEP_FADE * 1000 + 60)
    expect(ctxs[0].close).toHaveBeenCalled()
  })

  it('changing or clearing the timer reschedules it; pausing cancels it', () => {
    p.play(); p.setSleep(60); p.setSleep(30)
    vi.advanceTimersByTime(30 * 60000)
    expect(p.get().playing).toBe(false)
    p.play(); p.setSleep(15); p.setSleep(0)
    expect(p.get().endsAt).toBe(null)
    vi.advanceTimersByTime(60 * 60000)
    expect(p.get().playing).toBe(true)
    p.setSleep(15); p.stop()
    p.play()                                        // a fresh play re-arms from now
    expect(p.get().endsAt).toBe(Date.now() + 15 * 60000)
  })

  it('swapping colour while playing replaces the source without a new context', () => {
    p.play(); p.setColor('pink')
    expect(ctxs).toHaveLength(1)
    expect(ctxs[0].sources[0].stop).toHaveBeenCalled()
    expect(ctxs[0].sources[1].start).toHaveBeenCalled()
  })

  it('the sleep timer also stops on the audio clock, in case JS timers are throttled', () => {
    p.setSleep(15); p.play()
    const { param, sources } = ctxs[0]
    const at = 15 * 60
    expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0, at + SLEEP_FADE)
    expect(sources[0].stop).toHaveBeenCalledWith(at + SLEEP_FADE)
  })

  it('a volume change keeps the audio-clock stop in place', () => {
    p.setSleep(15); p.play(); p.setVolume(0.9)
    expect(ctxs[0].param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 15 * 60 + SLEEP_FADE)
  })

  it('turning the timer off removes the audio-clock stop', () => {
    p.setSleep(15); p.play(); p.setSleep(0)
    const s = ctxs[0].sources[0]
    expect(s.stop.mock.calls.at(-1)[0]).toBeGreaterThan(1e8)
  })

  it('after the sleep timer fires, it is reset to Off', () => {
    p.setSleep(15); p.play()
    vi.advanceTimersByTime(15 * 60000)
    expect(p.get().sleep).toBe(0)
  })

  it('shows paused when the system interrupts the audio', () => {
    p.play()
    const c = ctxs[0]
    c.state = 'suspended'; c.onstatechange()
    expect(p.get().playing).toBe(false)
    p.play()                                         // and Play recovers with a fresh context
    expect(p.get().playing).toBe(true)
    expect(ctxs).toHaveLength(2)
  })

  it('reports false instead of throwing when Web Audio is missing', () => {
    const q = createNoisePlayer({ newContext: () => { throw new TypeError('AudioContext is not a constructor') } })
    expect(q.play()).toBe(false)
    expect(q.get().playing).toBe(false)
  })
})
