// Generated sounds for winding down: white / pink / brown noise and fire / water / night scenes.
// Nothing is downloaded: a few seconds of sound are computed into an AudioBuffer that loops, so it
// works offline.
//
// Playback keeps going while the WebView runs (app in the background included). With the screen
// off, Android may suspend the WebView; staying audible then needs a native foreground media
// service, which is out of scope for v1.

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

// Gains below were tuned by measurement (12 s at 48 kHz) so every scene sits within ~1 dB RMS of
// pink/brown; `soft` catches the rare peak, so nothing clips, the loop blend included.
const SCENES = {
  // brown rumble that flickers slowly, plus sparse crackles (short decaying noise bursts), some in clusters
  fire(out, rand, sr) {
    fillNoise('brown', out, rand)
    const slow = wander(rand, sr / BLOCK, 0.4), flick = wander(rand, sr / BLOCK, 3), rate = 4 / sr
    let env = 0, decay = 0, pending = 0, gap = 0, g = 0
    const pop = () => {
      env = Math.max(env, 0.07 + 0.3 * rand() ** 2)
      decay = Math.exp(-1 / (sr * (0.0006 + rand() * 0.0025)))
    }
    for (let i = 0; i < out.length; i++) {
      if (pending && --gap <= 0) { pop(); pending--; gap = sr * (0.008 + rand() * 0.05) }
      else if (rand() < rate) {
        pop()
        if (rand() < 0.3) { pending = 1 + Math.floor(rand() * 4); gap = sr * (0.008 + rand() * 0.05) }
      }
      if (i % BLOCK === 0) g = 1.2 * (0.65 + 0.25 * slow() + 0.1 * flick())
      let v = out[i] * g
      if (env > 1e-4) { v += env * (rand() * 2 - 1); env *= decay }
      out[i] = soft(v)
    }
    return out
  },
  // pink noise, low-passed (~2.5 kHz) and high-passed (~120 Hz), with a slow swell and a faster burble
  water(out, rand, sr) {
    fillNoise('pink', out, rand)
    const lp = 1 - Math.exp(-2 * Math.PI * 2500 / sr), hp = 1 - Math.exp(-2 * Math.PI * 120 / sr)
    const slow = wander(rand, sr / BLOCK, 0.3), burble = wander(rand, sr / BLOCK, 6)
    let l = 0, h = 0, g = 0
    for (let i = 0; i < out.length; i++) {
      if (i % BLOCK === 0) g = 2.0 * (0.65 + 0.2 * slow() + 0.25 * burble())
      l += (out[i] - l) * lp; h += (l - h) * hp
      out[i] = soft((l - h) * g)
    }
    return out
  },
  // a soft brown bed and three crickets: chirps of 3-4 pulses of a ~4-5 kHz tone, irregularly spaced
  night(out, rand, sr) {
    fillNoise('brown', out, rand)
    for (let i = 0; i < out.length; i++) out[i] *= 0.95
    for (const [hz, pulsesPerSec, every, level] of CRICKETS) {
      const P = Math.round(sr / pulsesPerSec), on = P * 0.6, w = 2 * Math.PI * hz / sr
      let i = Math.floor(rand() * every * sr)
      while (i < out.length) {
        const len = (3 + (rand() < 0.5)) * P, amp = level * (0.7 + 0.3 * rand())
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

// One player for the whole app, so the noise keeps playing after its sheet closes.
// `newContext` and the timer functions are injectable for tests.
export function createNoisePlayer({
  newContext = () => new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }),
  setT = setTimeout, clearT = clearTimeout, now = Date.now
} = {}) {
  let ctx = null, gain = null, src = null, sleepTm = null, releaseTm = null
  let sleepAt = null   // audio-clock time the sleep fade starts; the backstop if JS timers are throttled
  let st = { playing: false, color: 'brown', volume: 0.5, sleep: 0, endsAt: null }
  const subs = new Set()
  const emit = patch => { st = { ...st, ...patch }; subs.forEach(f => f()) }

  const source = color => {
    const n = Math.round(ctx.sampleRate * LOOP_SEC)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    buf.copyToChannel(loopNoise(color, n, Math.random, ctx.sampleRate), 0)
    const s = ctx.createBufferSource()
    s.buffer = buf; s.loop = true; s.connect(gain)
    return s
  }
  // The audio itself fades and stops at sleepAt, whatever the JS timer does
  const backstop = () => {
    if (sleepAt === null) return
    gain.gain.setValueAtTime(st.volume, sleepAt)
    gain.gain.linearRampToValueAtTime(0, sleepAt + SLEEP_FADE)
    src.stop(sleepAt + SLEEP_FADE)
  }
  const ramp = (to, sec, at = ctx.currentTime) => {
    gain.gain.cancelScheduledValues(at)
    gain.gain.setValueAtTime(gain.gain.value, at)
    gain.gain.linearRampToValueAtTime(to, at + sec)
  }
  const arm = () => {
    clearT(sleepTm); sleepTm = null
    if (sleepAt !== null && ctx) {   // drop the previous audio-clock stop
      sleepAt = null
      ramp(st.volume, 0.05)
      src.stop(NEVER)
    }
    if (!st.playing || !st.sleep) return emit({ endsAt: null })
    const ms = st.sleep * 60000
    sleepAt = ctx.currentTime + ms / 1000
    backstop()
    sleepTm = setT(() => { p.stop(SLEEP_FADE); emit({ sleep: 0 }) }, ms)
    emit({ endsAt: now() + ms })
  }
  const release = (c, s) => {
    try { s.stop() } catch { /* already stopped */ }
    close(c)
    if (ctx === c) { ctx = gain = src = null }
  }

  const p = {
    get: () => st,
    subscribe(f) { subs.add(f); return () => subs.delete(f) },
    // true when playing; false when this device has no Web Audio
    play() {
      if (st.playing) return true
      clearT(releaseTm); releaseTm = null
      if (ctx) release(ctx, src)
      let c
      try { c = newContext() } catch { return false }
      ctx = c; sleepAt = null
      gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination)
      src = source(st.color); src.start()
      Promise.resolve(ctx.resume?.()).catch(() => {})   // WebViews may start a context suspended
      // The system can suspend or interrupt audio (call, focus loss): show it as paused, not playing
      ctx.onstatechange = () => {
        if (ctx === c && st.playing && c.state !== 'running') {
          clearT(sleepTm); sleepTm = null; sleepAt = null
          release(c, src)
          emit({ playing: false, endsAt: null })
        }
      }
      ramp(st.volume, FADE)
      emit({ playing: true }); arm()
      return true
    },
    // Fades out, then stops the source and releases the AudioContext.
    stop(fade = FADE) {
      if (!st.playing) return
      clearT(sleepTm); sleepTm = null; sleepAt = null
      ramp(0, fade)
      const c = ctx, s = src
      releaseTm = setT(() => { release(c, s); releaseTm = null }, fade * 1000 + 50)
      emit({ playing: false, endsAt: null })
    },
    setVolume(v) {
      emit({ volume: v })
      if (st.playing) { ramp(v, 0.05); backstop() }
    },
    setColor(color) {
      if (color === st.color) return
      emit({ color })
      if (!st.playing) return
      // dip to silence, swap sources at the bottom, come back up: no click
      const at = ctx.currentTime + 0.1
      ramp(0, 0.1)
      gain.gain.linearRampToValueAtTime(st.volume, at + FADE)
      src.stop(at)
      src = source(color); src.start(at)
      backstop()
    },
    setSleep(min) { emit({ sleep: min }); arm() }
  }
  return p
}

let player = null
export const noisePlayer = () => player || (player = createNoisePlayer())
