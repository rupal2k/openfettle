import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fillNoise, loopNoise, createNoisePlayer, FADE, SLEEP_FADE, LAYER_DEFAULT, cleanMix, cleanWindDown, STARTER_MIXES, MAX_MIXES, COLORS } from './noise.js'

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

// Goertzel power at `hz`, for the cricket check
const tone = (x, hz, sr = 48000) => {
  const c = 2 * Math.cos(2 * Math.PI * hz / sr); let s1 = 0, s2 = 0
  for (const v of x) { const s0 = v + c * s1 - s2; s2 = s1; s1 = s0 }
  return s1 * s1 + s2 * s2 - c * s1 * s2
}
// kurtosis of the first difference: ~3 for steady noise, much higher when sharp transients stand out
const spiky = x => {
  let m2 = 0, m4 = 0
  for (let i = 1; i < x.length; i++) { const d = (x[i] - x[i - 1]) ** 2; m2 += d; m4 += d * d }
  const n = x.length - 1
  return (m4 / n) / (m2 / n) ** 2
}

describe('scene generators (fire, water, night)', () => {
  const N = 48000 * 12
  const cache = {}
  const gen = c => cache[c] || (cache[c] = loopNoise(c, N, rng(13), 48000))
  const pinkDb = rmsDb(loopNoise('pink', N, rng(13), 48000))

  it('fire and night (isolated) never clip, over many seeds', () => {
    for (const c of ['fire', 'night']) {
      let clipped = 0
      for (let seed = 1; seed <= 20; seed++) for (const v of fillNoise(c, new Float32Array(48000 * 12), rng(seed))) if (Math.abs(v) >= 0.999) clipped++
      expect(clipped).toBe(0)
    }
  })
  it('brown never clips, over many seeds', () => {
    let clipped = 0
    for (let seed = 1; seed <= 40; seed++) for (const v of fillNoise('brown', new Float32Array(48000 * 12), rng(seed))) if (Math.abs(v) >= 0.999) clipped++
    expect(clipped).toBe(0)
  })

  // isolated layers (no noise bed of their own), measured against pink: water is shaped noise and
  // matches it; fire (crackles over a light rumble) and night (crickets at 4-5 kHz, which carry
  // further than their RMS) sit a little lower, so they blend with a noise layer
  const SCENE_DB = { fire: [-5, -2], water: [-1.5, 1.5], night: [-7.5, -4.5] }
  for (const c of ['fire', 'water', 'night']) {
    it(`${c}: bounded, not silent, never clipped, at its level against pink`, () => {
      const x = gen(c)
      let peak = 0, clipped = 0
      for (const v of x) { const m = Math.abs(v); if (m > peak) peak = m; if (m >= 0.999) clipped++ }
      expect(peak).toBeLessThan(1)
      expect(clipped).toBe(0)
      expect(peak).toBeGreaterThan(0.05)
      const db = rmsDb(x) - pinkDb
      expect(db).toBeGreaterThan(SCENE_DB[c][0])
      expect(db).toBeLessThan(SCENE_DB[c][1])
    })
    it(`${c}: the loop seam is no bigger a step than the sound itself makes`, () => {
      const x = gen(c), d = []
      for (let i = 1; i < x.length; i++) d.push(Math.abs(x[i] - x[i - 1]))
      d.sort((a, b) => a - b)
      expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThanOrEqual(d[Math.floor(d.length * 0.99)])
    })
  }
  it('fire has crackles: its steps are far spikier than pink', () => {
    const p = spiky(loopNoise('pink', N, rng(13), 48000)), f = spiky(gen('fire'))
    expect(f).toBeGreaterThan(2 * p)   // measured: pink 2.2, fire 5.1
  })
  it('water leans to low frequencies like pink/brown', () => {
    const w = diffRatio(fillNoise('white', new Float32Array(48000), rng(3)))
    expect(diffRatio(gen('water'))).toBeLessThan(w * 0.5)
  })
  it('night has cricket energy around 4.5 kHz that brown lacks', () => {
    const ratio = x => tone(x, 4500) / tone(x, 500)
    expect(ratio(gen('night'))).toBeGreaterThan(100 * ratio(loopNoise('brown', N, rng(13), 48000)))
  })
  it('each 12 s buffer is quick to generate', () => {
    for (const c of ['white', 'pink', 'brown', 'fire', 'water', 'night']) {
      const t0 = performance.now(); loopNoise(c, N, Math.random, 48000)
      expect(performance.now() - t0).toBeLessThan(600)   // ~30-120 ms in Node; loose so a busy CI does not flake
    }
  })
})

// AudioContext mocked at the boundary only. Every gain has its own param; the first one made is
// the master (volume, fades, sleep timer), the rest are layers.
function fakeContext({ compressor = false } = {}) {
  const gains = [], sources = []
  const mkParam = () => { const p = { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(v => { p.target = v }) }; return p }
  const ctx = {
    sampleRate: 8000, currentTime: 0, destination: {}, state: 'running', onstatechange: null,
    resume: vi.fn(() => Promise.resolve()),
    createGain: () => { const g = { gain: mkParam(), connect: vi.fn() }; gains.push(g); return g },
    createBuffer: (ch, n) => ({ length: n, copyToChannel: vi.fn() }),
    createBufferSource: () => { const s = { connect: vi.fn(), start: vi.fn(), stop: vi.fn() }; sources.push(s); return s },
    close: vi.fn(() => Promise.resolve()),
    gains, sources,
    get master() { return gains[0].gain }
  }
  if (compressor) ctx.createDynamicsCompressor = () => { const p = () => ({ value: 0 }); const c = { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), connect: vi.fn() }; ctx.lim = c; return c }
  return ctx
}

describe('noise player (mixer)', () => {
  let ctxs, p
  beforeEach(() => {
    vi.useFakeTimers()
    ctxs = []
    p = createNoisePlayer({ newContext: () => { const c = fakeContext(); ctxs.push(c); return c } })
  })
  afterEach(() => vi.useRealTimers())

  it('fades in on play: brown by default, master to the volume', () => {
    p.setVolume(0.7); p.play()
    expect(p.get().playing).toBe(true)
    const c = ctxs[0]
    expect(c.sources).toHaveLength(1)
    expect(c.sources[0].loop).toBe(true)
    expect(c.master.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.7, FADE)
    expect(c.gains[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(LAYER_DEFAULT, FADE)
  })

  it('plays every layer of a mix, each at its own level, on one context', () => {
    p.setMix({ fire: 0.7, water: 0.45, night: 0.2 }); p.play()
    const c = ctxs[0]
    expect(c.sources).toHaveLength(3)
    expect(c.gains.slice(1).map(g => g.gain.target).sort()).toEqual([0.2, 0.45, 0.7])
  })

  it('switching a layer on while playing adds it on the same context, faded in', () => {
    p.play(); p.toggle('night')
    const c = ctxs[0]
    expect(ctxs).toHaveLength(1)
    expect(c.sources).toHaveLength(2)
    expect(c.sources[1].start).toHaveBeenCalled()
    expect(c.gains[2].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(LAYER_DEFAULT, FADE)
    expect(p.get().mix.night).toBe(LAYER_DEFAULT)
  })

  it('a layer level changes only that layer; 0 fades it out and stops it', () => {
    p.setMix({ brown: 0.6, fire: 0.6 }); p.play()
    const c = ctxs[0], fireGain = c.gains[2].gain
    p.setLevel('fire', 0.3)
    expect(fireGain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.3, 0.05)
    expect(c.gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledTimes(1)   // brown untouched
    p.setLevel('fire', 0)
    expect(fireGain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, FADE)
    expect(c.sources[1].stop).toHaveBeenCalledWith(FADE)
    expect(p.get().playing).toBe(true)
  })

  it('switching the last layer off pauses', () => {
    p.play(); p.toggle('brown')
    expect(p.get().playing).toBe(false)
  })

  it('a new mix cross-fades on the same context: layers leave, stay or join', () => {
    p.setMix({ brown: 0.6, fire: 0.5 }); p.play()
    p.setMix(STARTER_MIXES[0].mix)       // campfire by a stream: fire + water
    const c = ctxs[0]
    expect(ctxs).toHaveLength(1)
    expect(c.sources[0].stop).toHaveBeenCalled()       // brown left
    expect(c.sources[1].stop).not.toHaveBeenCalled()   // fire stayed
    expect(c.sources).toHaveLength(3)                  // water joined
  })

  it('an empty mix plays brown rather than silence', () => {
    p.setLevel('brown', 0); p.play()
    expect(p.get().mix.brown).toBe(LAYER_DEFAULT)
    expect(ctxs[0].sources).toHaveLength(1)
  })

  it('stop() fades out, then stops every layer and closes the context', () => {
    p.setMix({ fire: 0.5, night: 0.5 }); p.play(); p.stop()
    const c = ctxs[0]
    expect(p.get().playing).toBe(false)
    expect(c.master.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, FADE)
    expect(c.close).not.toHaveBeenCalled()          // still fading
    vi.advanceTimersByTime(FADE * 1000 + 60)
    expect(c.sources.every(s => s.stop.mock.calls.length)).toBe(true)
    expect(c.close).toHaveBeenCalledTimes(1)
  })

  it('sleep timer fades out and stops after the chosen minutes', () => {
    p.setSleep(15); p.play()
    expect(p.get().endsAt).toBe(Date.now() + 15 * 60000)
    vi.advanceTimersByTime(15 * 60000 - 1)
    expect(p.get().playing).toBe(true)
    vi.advanceTimersByTime(1)
    expect(p.get().playing).toBe(false)
    expect(ctxs[0].master.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, SLEEP_FADE)
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

  it('the sleep timer also stops every layer on the audio clock, in case JS timers are throttled', () => {
    p.setMix({ brown: 0.6, night: 0.4 }); p.setSleep(15); p.play()
    const c = ctxs[0], at = 15 * 60
    expect(c.master.linearRampToValueAtTime).toHaveBeenCalledWith(0, at + SLEEP_FADE)
    expect(c.sources.every(s => s.stop.mock.calls.some(a => a[0] === at + SLEEP_FADE))).toBe(true)
    p.toggle('fire')                                // a layer added later gets the same stop
    expect(c.sources[2].stop).toHaveBeenCalledWith(at + SLEEP_FADE)
  })

  it('a volume change keeps the audio-clock stop in place', () => {
    p.setSleep(15); p.play(); p.setVolume(0.9)
    expect(ctxs[0].master.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 15 * 60 + SLEEP_FADE)
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

  it('routes the mix through a limiter when the WebView has one', () => {
    const q = createNoisePlayer({ newContext: () => { const c = fakeContext({ compressor: true }); ctxs.push(c); return c } })
    q.play()
    const c = ctxs.at(-1)
    expect(c.gains[0].connect).toHaveBeenCalledWith(c.lim)
    expect(c.lim.connect).toHaveBeenCalledWith(c.destination)
    expect(c.lim.ratio.value).toBeGreaterThanOrEqual(10)
  })

  it('restore() brings back the saved mix and volume, but never while playing', () => {
    p.restore({ mix: { night: 0.4, water: 0.3 }, volume: 0.8 })
    expect(p.get().mix.night).toBe(0.4); expect(p.get().volume).toBe(0.8)
    p.play(); p.restore({ mix: { brown: 1 }, volume: 0.1 })
    expect(p.get().mix.brown).toBe(0); expect(p.get().volume).toBe(0.8)
  })
})

describe('saved Wind down settings (backups are untrusted)', () => {
  it('cleanMix keeps known layers, clamps levels and drops an empty mix', () => {
    expect(cleanMix({ fire: 2, night: -1, rain: 0.5 })).toEqual({ white: 0, pink: 0, brown: 0, fire: 1, water: 0, night: 0 })
    expect(cleanMix(JSON.parse('{"__proto__": {"water": 1}, "fire": 0.5}')).water).toBe(0)
    expect(cleanMix({ fire: 0 })).toBe(null)
    expect(cleanMix('fire')).toBe(null)
    expect(cleanMix([0.5])).toBe(null)
  })
  it('cleanWindDown keeps up to 5 named mixes with a valid mix, names trimmed to 30', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: ' Mix ' + i + '   ', mix: { brown: 0.5 } }))
    const w = cleanWindDown({ mix: { water: 0.5 }, volume: 3, mixes: [{ name: '', mix: { fire: 1 } }, { name: 'x'.repeat(50), mix: { fire: 1 } }, { name: 'bad', mix: {} }, 'nope', ...many] })
    expect(w.volume).toBe(1)
    expect(w.mix.water).toBe(0.5)
    expect(w.mixes).toHaveLength(MAX_MIXES)
    expect(w.mixes[0].name).toHaveLength(30)
    expect(w.mixes[1].name).toBe('Mix 0')
  })
  it('a missing or broken value gives the defaults', () => {
    for (const bad of [undefined, null, 'x', [], { volume: 'loud', mixes: 'all' }]) expect(cleanWindDown(bad)).toEqual({ mix: null, volume: 0.5, mixes: [] })
  })
  it('starter mixes are valid mixes', () => {
    for (const m of STARTER_MIXES) { expect(cleanMix(m.mix)).toEqual(m.mix); expect(COLORS).toEqual(expect.arrayContaining(Object.keys(m.mix))) }
  })
})
