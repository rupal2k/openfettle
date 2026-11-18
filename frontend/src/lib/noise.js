// Generated sounds for winding down: white / pink / brown noise and fire / water / night scenes.
// Nothing is downloaded: a few seconds of sound are computed into an AudioBuffer that loops, so it
// works offline.
//
// In the Android app, the native WindDownService (a media-playback foreground service with a
// notification and a partial wake lock, see sheets.jsx bridgeWindDown) keeps this playing with
// the app minimised or the screen off.

export const COLORS = ['white', 'pink', 'brown', 'fire', 'water', 'night']
export const SLEEP_OPTIONS = [0, 15, 30, 60]   // minutes, 0 = off
export const FADE = 0.5                        // seconds, start/stop/pause
export const SLEEP_FADE = 10                   // seconds, the sleep timer fades out gently
const LOOP_SEC = 12                            // long enough that the loop isn't noticed
const XFADE = 4096                             // samples blended so the loop seam is continuous
const WHITE_GAIN = 0.34                        // brings white to pink/brown loudness (~-14 dBFS RMS)
const NEVER = 1e9                              // "stop" time that never comes (cancels a scheduled stop)

const close = c => Promise.resolve(c.close()).catch(() => {})
const clamp = v => v > 1 ? 1 : v < -1 ? -1 : v
// Soft knee above 0.8: rare peaks (a loud pop on a loud swell, the loop blend) bend instead of clip;
// t / (1 + t) never reaches 1, so neither does the output.
const soft = v => {
  const m = v < 0 ? -v : v
  if (m <= 0.8) return v
  const t = (m - 0.8) / 0.2, y = 0.8 + 0.2 * t / (1 + t)
  return v < 0 ? -y : y
}

// Fills `out` with the given sound at sample rate `sr`; every sample is in [-1, 1].
export function fillNoise(color, out, rand = Math.random, sr = 48000) {
  if (SCENES[color]) return SCENES[color](out, rand, sr)
  // Paul Kellet's refined pink filter state, and the leaky integrator for brown
  // one loop per colour, so the per-sample loop has no branch on the colour (generation speed)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0
  if (color === 'pink') for (let i = 0; i < out.length; i++) {
    const w = rand() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856
    b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980
    out[i] = clamp((b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11)
    b6 = w * 0.115926
  } else if (color === 'brown') for (let i = 0; i < out.length; i++) {
    br = (br + 0.02 * (rand() * 2 - 1)) / 1.02
    out[i] = soft(br * 3.5)
  } else for (let i = 0; i < out.length; i++) out[i] = (rand() * 2 - 1) * WHITE_GAIN
  return out
}

// A slowly wandering level in [0, 1]: a new random target every 1/rate s, smoothed at `rate` Hz.
// Called once per BLOCK samples (pass sr / BLOCK): the levels move far too slowly to step audibly.
const BLOCK = 64
function wander(rand, sr, rate) {
  const hold = Math.max(1, Math.round(sr / rate)), a = 1 - Math.exp(-2 * Math.PI * rate / sr)
  let v = rand(), target = v, n = 0
  return () => { if (++n >= hold) { n = 0; target = rand() } return (v += (target - v) * a) }
}

// The scenes are isolated layers for the mixer: fire and night carry no noise bed of their own
// (pick brown or pink alongside if you want one). Gains were tuned by measurement (12 s at 48 kHz),
// see SCENE_DB in the tests; `soft` catches the rare peak, so nothing clips, the loop blend included.
const SCENES = {
  // crackles and pops (short decaying bursts, some in clusters) over a low, warm, flickering rumble.
  // Both are low-passed: unfiltered, the rumble reads as hiss and the pops as fizz, not a fire.
  fire(out, rand, sr) {
    fillNoise('brown', out, rand)
    const slow = wander(rand, sr / BLOCK, 0.4), flick = wander(rand, sr / BLOCK, 3), rate = FIRE.rate / sr
    const lpR = 1 - Math.exp(-2 * Math.PI * FIRE.rumbleHz / sr), lpC = 1 - Math.exp(-2 * Math.PI * FIRE.crackleHz / sr)
    let env = 0, decay = 0, pending = 0, gap = 0, g = 0, r = 0, c = 0
    const pop = () => {
      env = Math.max(env, FIRE.pop + FIRE.popVar * rand() ** 2)
      decay = Math.exp(-1 / (sr * (0.0006 + rand() * 0.0025)))
    }
    for (let i = 0; i < out.length; i++) {
      if (pending && --gap <= 0) { pop(); pending--; gap = sr * (0.008 + rand() * 0.05) }
      else if (rand() < rate) {
        pop()
        if (rand() < 0.3) { pending = 1 + Math.floor(rand() * 4); gap = sr * (0.008 + rand() * 0.05) }
      }
      if (i % BLOCK === 0) g = FIRE.rumble * (0.65 + 0.25 * slow() + 0.1 * flick())
      r += (out[i] - r) * lpR
      let v = r * g
      if (env > 1e-4) { c += (env * (rand() * 2 - 1) - c) * lpC; v += c * FIRE.crackleGain; env *= decay } else c *= 0.9
      out[i] = soft(v)
    }
    return out
  },
  // a flowing stream, not waves: a steady band of flowing water (pink noise, ~300 Hz-2.2 kHz, so
  // neither boom nor hiss) with a fast flutter and no slow swell, plus many small bubbles. Each
  // bubble is a short tone that rises in pitch as it decays, the way real bubbles ring.
  water(out, rand, sr) {
    fillNoise('pink', out, rand)
    const lp = 1 - Math.exp(-2 * Math.PI * WATER.lpHz / sr), hp = 1 - Math.exp(-2 * Math.PI * WATER.hpHz / sr)
    const flutter = wander(rand, sr / BLOCK, 12), drift = wander(rand, sr / BLOCK, 0.1)
    const rate = WATER.bubbles / sr, bubbles = []
    let l = 0, h = 0, g = 0
    for (let i = 0; i < out.length; i++) {
      if (i % BLOCK === 0) g = WATER.bed * (0.75 + 0.15 * flutter() + 0.1 * drift())
      l += (out[i] - l) * lp; h += (l - h) * hp
      let v = (l - h) * g
      if (rand() < rate) {
        const f = 300 + 1700 * rand() ** 2, len = Math.round(sr * (0.008 + 0.032 * rand()))
        bubbles.push({ ph: 0, f, rise: f * (0.3 + 0.7 * rand()) / len, amp: WATER.pop * (0.3 + 0.7 * rand()), k: 0, len })
      }
      for (let j = bubbles.length - 1; j >= 0; j--) {
        const bb = bubbles[j], env = Math.sin(Math.PI * bb.k / bb.len) * (1 - bb.k / bb.len)
        v += bb.amp * env * Math.sin(bb.ph)
        bb.ph += 2 * Math.PI * (bb.f + bb.rise * bb.k) / sr
        if (++bb.k >= bb.len) bubbles.splice(j, 1)
      }
      out[i] = soft(v)
    }
    return out
  },
  // three crickets and nothing else (no noise bed): chirps of 3-4 pulses of a ~4-5 kHz tone,
  // irregularly spaced, with quiet in between
  night(out, rand, sr) {
    out.fill(0)
    for (const [hz, pulsesPerSec, every, level] of CRICKETS) {
      const P = Math.round(sr / pulsesPerSec), on = P * 0.6, w = 2 * Math.PI * hz / sr
      let i = Math.floor(rand() * every * sr)
      while (i < out.length) {
        const len = (3 + (rand() < 0.5)) * P, amp = NIGHT.crickets * level * (0.7 + 0.3 * rand())
        for (let k = 0; k < len && i + k < out.length; k++) {
          const ph = k % P
          if (ph < on) out[i + k] = soft(out[i + k] + amp * Math.sin(Math.PI * ph / on) ** 2 * Math.sin(w * k))
        }
        i += len + Math.round(every * sr * (0.6 + 0.8 * rand()))
      }
    }
    return out
  }
}
const CRICKETS = [[4500, 34, 0.8, 0.12], [4800, 38, 1.1, 0.08], [4150, 30, 1.6, 0.05]]  // Hz, pulses/s, s between chirps, level
const FIRE = { rumble: 0.95, rumbleHz: 250, rate: 7, pop: 0.16, popVar: 0.6, crackleHz: 3000, crackleGain: 1.8 }
const WATER = { lpHz: 2200, hpHz: 300, bed: 2.2, bubbles: 60, pop: 0.35 }
const NIGHT = { crickets: 6 }

// n samples that loop without a jump: the tail is generated past n and blended into the head.
// Equal-power curves keep the level steady through the blend (noise halves are uncorrelated).
export function loopNoise(color, n, rand = Math.random, sr = 48000) {
  const f = Math.min(XFADE, n >> 1)
  const a = fillNoise(color, new Float32Array(n + f), rand, sr)
  const out = a.subarray(0, n)
  for (let i = 0; i < f; i++) {
    const k = (i / f) * Math.PI / 2
    out[i] = soft(a[i] * Math.sin(k) + a[n + i] * Math.cos(k))
  }
  return out
}

// A mix: how loud each layer plays, 0 (off) to 1. Any combination is allowed.
export const LAYER_DEFAULT = 0.6                // a layer switched on starts here
export const MAX_MIXES = 5                      // saved mixes kept
export const emptyMix = () => Object.fromEntries(COLORS.map(c => [c, 0]))
export const activeLayers = mix => COLORS.filter(c => mix?.[c] > 0)
// Starter mixes, shown before anyone has saved their own (names are i18n keys)
export const STARTER_MIXES = [
  { name: 'Campfire by a stream', mix: { fire: 0.7, water: 0.45 } },
  { name: 'Summer night', mix: { night: 0.6, water: 0.3 } },
  { name: 'Deep focus', mix: { brown: 0.6, pink: 0.25 } }
].map(m => ({ ...m, mix: { ...emptyMix(), ...m.mix } }))

// A mix from a backup or an old build: known layers only, levels clamped to 0-1. null when empty.
export function cleanMix(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null
  const out = emptyMix()
  for (const c of COLORS) { const v = +m[c]; out[c] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0 }
  return activeLayers(out).length ? out : null
}
// Saved Wind down settings (S.winddown): the last mix, the master volume and named mixes
export function cleanWindDown(w) {
  const plain = o => o && typeof o === 'object' && !Array.isArray(o)
  const vol = +w?.volume
  return {
    mix: cleanMix(w?.mix),
    volume: w?.volume != null && Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 0.5,
    mixes: (Array.isArray(w?.mixes) ? w.mixes : []).filter(plain)
      .map(m => ({ name: typeof m.name === 'string' ? m.name.trim().slice(0, 30) : '', mix: cleanMix(m.mix) }))
      .filter(m => m.name && m.mix).slice(0, MAX_MIXES)
  }
}

// One player for the whole app, so the sound keeps playing after its sheet closes. Each layer is
// its own looping source and gain; all of them feed one master gain (volume, fades, the sleep
// timer) and a limiter, so stacking every layer at full volume bends instead of clipping.
// `newContext` and the timer functions are injectable for tests.
export function createNoisePlayer({
  newContext = () => new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }),
  setT = setTimeout, clearT = clearTimeout, now = Date.now
} = {}) {
  let ctx = null, master = null, sleepTm = null, releaseTm = null
  const layers = {}    // colour -> { src, gain } while it plays
  let sleepAt = null   // audio-clock time the sleep fade starts; the backstop if JS timers are throttled
  let st = { playing: false, mix: { ...emptyMix(), brown: LAYER_DEFAULT }, volume: 0.5, sleep: 0, endsAt: null }
  const subs = new Set()
  const emit = patch => { st = { ...st, ...patch }; subs.forEach(f => f()) }

  const source = color => {
    const n = Math.round(ctx.sampleRate * LOOP_SEC)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    buf.copyToChannel(loopNoise(color, n, Math.random, ctx.sampleRate), 0)
    const s = ctx.createBufferSource()
    s.buffer = buf; s.loop = true
    return s
  }
  const rampParam = (param, to, sec, at = ctx.currentTime) => {
    param.cancelScheduledValues(at)
    param.setValueAtTime(param.value, at)
    param.linearRampToValueAtTime(to, at + sec)
  }
  // a layer starts silent and comes up to its level, so switching one on never clicks
  const startLayer = (color, at = ctx.currentTime) => {
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(master)
    const src = source(color); src.connect(gain); src.start(at)
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(st.mix[color], at + FADE)
    if (sleepAt !== null) src.stop(sleepAt + SLEEP_FADE)
    layers[color] = { src, gain }
  }
  const endLayer = (color, fade = FADE) => {
    const l = layers[color]; if (!l) return
    rampParam(l.gain.gain, 0, fade)
    try { l.src.stop(ctx.currentTime + fade) } catch { /* already stopped */ }
    delete layers[color]
  }
  // The audio itself fades and stops at sleepAt, whatever the JS timer does
  const backstop = () => {
    if (sleepAt === null) return
    master.gain.setValueAtTime(st.volume, sleepAt)
    master.gain.linearRampToValueAtTime(0, sleepAt + SLEEP_FADE)
    for (const l of Object.values(layers)) l.src.stop(sleepAt + SLEEP_FADE)
  }
  const ramp = (to, sec, at) => rampParam(master.gain, to, sec, at)
  const arm = () => {
    clearT(sleepTm); sleepTm = null
    if (sleepAt !== null && ctx) {   // drop the previous audio-clock stop
      sleepAt = null
      ramp(st.volume, 0.05)
      for (const l of Object.values(layers)) l.src.stop(NEVER)
    }
    if (!st.playing || !st.sleep) return emit({ endsAt: null })
    const ms = st.sleep * 60000
    sleepAt = ctx.currentTime + ms / 1000
    backstop()
    sleepTm = setT(() => { p.stop(SLEEP_FADE); emit({ sleep: 0 }) }, ms)
    emit({ endsAt: now() + ms })
  }
  const release = (c, ls) => {
    for (const l of ls) { try { l.src.stop() } catch { /* already stopped */ } }
    close(c)
    if (ctx === c) { ctx = master = null; for (const k of Object.keys(layers)) delete layers[k] }
  }

  const p = {
    get: () => st,
    subscribe(f) { subs.add(f); return () => subs.delete(f) },
    // true when playing; false when this device has no Web Audio. A mix with nothing on plays brown.
    play() {
      if (st.playing) return true
      clearT(releaseTm); releaseTm = null
      if (ctx) release(ctx, Object.values(layers))
      if (!activeLayers(st.mix).length) emit({ mix: { ...st.mix, brown: LAYER_DEFAULT } })
      let c
      try { c = newContext() } catch { return false }
      ctx = c; sleepAt = null
      master = ctx.createGain(); master.gain.value = 0
      // the limiter is optional: without one (older WebViews, tests) the mix plays straight out
      const lim = ctx.createDynamicsCompressor?.()
      if (lim) {
        lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.25
        master.connect(lim); lim.connect(ctx.destination)
      } else master.connect(ctx.destination)
      for (const color of activeLayers(st.mix)) startLayer(color)
      Promise.resolve(ctx.resume?.()).catch(() => {})   // WebViews may start a context suspended
      // The system can suspend or interrupt audio (call, focus loss): show it as paused, not playing
      ctx.onstatechange = () => {
        if (ctx === c && st.playing && c.state !== 'running') {
          clearT(sleepTm); sleepTm = null; sleepAt = null
          release(c, Object.values(layers))
          emit({ playing: false, endsAt: null })
        }
      }
      ramp(st.volume, FADE)
      emit({ playing: true }); arm()
      return true
    },
    // Fades out, then stops every layer and releases the AudioContext.
    stop(fade = FADE) {
      if (!st.playing) return
      clearT(sleepTm); sleepTm = null; sleepAt = null
      ramp(0, fade)
      const c = ctx, ls = Object.values(layers)
      releaseTm = setT(() => { release(c, ls); releaseTm = null }, fade * 1000 + 50)
      emit({ playing: false, endsAt: null })
    },
    // master volume
    setVolume(v) {
      emit({ volume: v })
      if (st.playing) { ramp(v, 0.05); backstop() }
    },
    // one layer's level: 0 switches it off (and pauses when it was the last one playing)
    setLevel(color, v) {
      if (!COLORS.includes(color)) return
      const level = Math.min(1, Math.max(0, +v || 0))
      emit({ mix: { ...st.mix, [color]: level } })
      if (!st.playing) return
      if (!level) { endLayer(color); if (!Object.keys(layers).length) p.stop(); return }
      if (layers[color]) rampParam(layers[color].gain.gain, level, 0.05)
      else startLayer(color)
    },
    // switch a layer on (at its default level) or off
    toggle(color) { p.setLevel(color, st.mix[color] > 0 ? 0 : LAYER_DEFAULT) },
    // replace the whole mix (a starter or saved mix): layers cross-fade on the same context
    setMix(mix) {
      const m = cleanMix(mix); if (!m) return
      emit({ mix: m })
      if (!st.playing) return
      for (const color of COLORS) {
        if (!m[color]) endLayer(color)
        else if (layers[color]) rampParam(layers[color].gain.gain, m[color], FADE)
        else startLayer(color)
      }
    },
    // the saved settings at app start (never while playing): the last mix and the volume
    restore({ mix, volume } = {}) {
      if (st.playing) return
      const m = cleanMix(mix), v = +volume
      emit({ ...(m ? { mix: m } : {}), ...(volume != null && Number.isFinite(v) ? { volume: Math.min(1, Math.max(0, v)) } : {}) })
    },
    setSleep(min) { emit({ sleep: min }); arm() }
  }
  return p
}

let player = null
export const noisePlayer = () => player || (player = createNoisePlayer())
