// Generated white / pink / brown noise for winding down. Nothing is downloaded: a few seconds of
// noise are computed into an AudioBuffer that loops, so it works offline.
//
// Playback keeps going while the WebView runs (app in the background included). With the screen
// off, Android may suspend the WebView; staying audible then needs a native foreground media
// service, which is out of scope for v1.

export const COLORS = ['white', 'pink', 'brown']
export const SLEEP_OPTIONS = [0, 15, 30, 60]   // minutes, 0 = off
export const FADE = 0.5                        // seconds, start/stop/pause
export const SLEEP_FADE = 10                   // seconds, the sleep timer fades out gently
const LOOP_SEC = 4
const XFADE = 2048                             // samples blended so the loop seam is continuous

const close = c => Promise.resolve(c.close()).catch(() => {})
const clamp = v => v > 1 ? 1 : v < -1 ? -1 : v

// Fills `out` with noise of the given colour; every sample is in [-1, 1].
export function fillNoise(color, out, rand = Math.random) {
  // Paul Kellet's refined pink filter state, and the leaky integrator for brown
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0
  for (let i = 0; i < out.length; i++) {
    const w = rand() * 2 - 1
    if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980
      out[i] = clamp((b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11)
      b6 = w * 0.115926
    } else if (color === 'brown') {
      br = (br + 0.02 * w) / 1.02
      out[i] = clamp(br * 3.5)
    } else out[i] = w
  }
  return out
}

// n samples that loop without a jump: the tail is generated past n and blended into the head.
export function loopNoise(color, n, rand = Math.random) {
  const f = Math.min(XFADE, n >> 1)
  const a = fillNoise(color, new Float32Array(n + f), rand)
  const out = a.subarray(0, n)
  for (let i = 0; i < f; i++) { const k = i / f; out[i] = a[i] * k + a[n + i] * (1 - k) }
  return out
}

// One player for the whole app, so the noise keeps playing after its sheet closes.
// `newContext` and the timer functions are injectable for tests.
export function createNoisePlayer({
  newContext = () => new (window.AudioContext || window.webkitAudioContext)(),
  setT = setTimeout, clearT = clearTimeout, now = Date.now
} = {}) {
  let ctx = null, gain = null, src = null, sleepTm = null, releaseTm = null
  let st = { playing: false, color: 'brown', volume: 0.5, sleep: 0, endsAt: null }
  const subs = new Set()
  const emit = patch => { st = { ...st, ...patch }; subs.forEach(f => f()) }

  const source = color => {
    const n = Math.round(ctx.sampleRate * LOOP_SEC)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    buf.copyToChannel(loopNoise(color, n), 0)
    const s = ctx.createBufferSource()
    s.buffer = buf; s.loop = true; s.connect(gain)
    return s
  }
  const ramp = (to, sec, at = ctx.currentTime) => {
    gain.gain.cancelScheduledValues(at)
    gain.gain.setValueAtTime(gain.gain.value, at)
    gain.gain.linearRampToValueAtTime(to, at + sec)
  }
  const arm = () => {
    clearT(sleepTm); sleepTm = null
    if (!st.playing || !st.sleep) return emit({ endsAt: null })
    const ms = st.sleep * 60000
    sleepTm = setT(() => p.stop(SLEEP_FADE), ms)
    emit({ endsAt: now() + ms })
  }

  const p = {
    get: () => st,
    subscribe(f) { subs.add(f); return () => subs.delete(f) },
    play() {
      if (st.playing) return
      clearT(releaseTm); releaseTm = null
      if (ctx) { try { src.stop() } catch { /* already stopped */ } close(ctx) }
      ctx = newContext()
      gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination)
      src = source(st.color); src.start()
      ramp(st.volume, FADE)
      emit({ playing: true }); arm()
    },
    // Fades out, then stops the source and releases the AudioContext.
    stop(fade = FADE) {
      if (!st.playing) return
      clearT(sleepTm); sleepTm = null
      ramp(0, fade)
      const c = ctx, s = src
      releaseTm = setT(() => {
        try { s.stop() } catch { /* already stopped */ }
        close(c)
        if (ctx === c) { ctx = gain = src = null }
        releaseTm = null
      }, fade * 1000 + 50)
      emit({ playing: false, endsAt: null })
    },
    setVolume(v) {
      emit({ volume: v })
      if (st.playing) ramp(v, 0.05)
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
    },
    setSleep(min) { emit({ sleep: min }); arm() }
  }
  return p
}

let player = null
export const noisePlayer = () => player || (player = createNoisePlayer())
