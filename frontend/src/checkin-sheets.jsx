// End-of-day check-in (docs/specs/2026-11-18-evening-check-in.md): the flow, its settings and
// the private history. Pure logic is in lib/checkin.js. Nothing is saved until "Finish my workday";
// a field the user did not choose is left out of the entry, never filled with a default.
import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { t, getLang } from './lib/i18n.js'

// The low-mood line shows only in languages a native speaker has reviewed (spec D3); add each one once checked.
const LOW_MOOD_LANGS = ['en']
import { fmtDate, isoOf, DAYS } from './lib/format.js'
import { effectiveRoutine } from './lib/history.js'
import { beep, vibrate, cancelBeeps } from './lib/sound.js'
import { requestWakeLock, releaseWakeLock } from './lib/wakelock.js'
import { privacyScreen, askNotifications, syncCheckinReminder, MOBILE } from './lib/mobile.js'
import { noisePlayer } from './lib/noise.js'
import { nav } from './lib/nav.js'
import {
  MOODS, STRESSORS, ACT_GROUPS, CUES, NOTE_MAX, OWN_MAX, cleanEntry, doneOn, carriedNote, followUpTarget,
  recentActivities, checkinDay, lowMoodDue, nudgeDue, usefulDue, breathPlan, breathAt, vibratePattern
} from './lib/checkin.js'
import { confirmSheet, keepWindDown, bridgeWindDown } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import { Button, Segmented, Switch, TextField, TextArea, Section, Row } from './components/ui.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

// Labels: literal t() calls so the translation coverage test sees every key
export const moodLabel = c => ({ calm: t('Calm'), content: t('Content'), worried: t('Worried'), frustrated: t('Frustrated'), overwhelmed: t('Overwhelmed'), low: t('Feeling low'), unsure: t('Unsure'), other: t('Something else') }[c])
export const stressLabel = c => ({ workload: t('Workload'), deadlines: t('Deadlines'), clients: t('Clients or customers'), team: t('Team'), interruptions: t('Interruptions'), priorities: t('Unclear priorities'), blockers: t('Technical blockers'), personal: t('Personal'), none: t('Nothing specific'), other: t('Something else') }[c])
const groupLabel = g => ({ quiet: t('Quiet'), move: t('Movement'), attention: t('Change of attention'), connect: t('Connection'), rest: t('Resting') }[g])
export const actLabel = (c, own) => c === 'own' ? own : ({
  read: t('Read'), music: t('Listen to music'), journal: t('Write in a journal'), sit: t('Sit quietly'),
  walk: t('Go for a walk'), stretch: t('Stretch'), cycle: t('Ride a bike'), yoga: t('Yoga'),
  cook: t('Cook something'), hobby: t('A hobby'), puzzle: t('A game or puzzle'), tidy: t('Tidy up'),
  call: t('Call someone'), people: t('Time with family or friends'), pet: t('Time with a pet'),
  bath: t('A bath or shower'), early: t('An early night'), nothing: t('Do nothing for a while')
}[c])
const cueLabel = c => ({ both: t('Sound and vibration'), sound: t('Sound'), vibrate: t('Vibration'), none: t('None') }[c])
const phaseLabel = p => ({ in: t('Breathe in'), hold: t('Hold'), out: t('Breathe out'), hold2: t('Hold'), natural: t('Just breathe'), end: t('Done') }[p])
export const summaryOf = e => [e.mood && moodLabel(e.mood), e.energy && t('energy {0}', e.energy), e.stress && stressLabel(e.stress)].filter(Boolean).join(' · ')

// One choice from a set of chips; tapping the chosen chip clears it (nothing is ever preselected)
function Chips({ options, value, onChange, labelledBy }) {
  return <div className="chips" role="group" aria-labelledby={labelledBy} style={{ flexWrap: 'wrap', overflowX: 'visible' }}>
    {options.map(o => <button key={o.value} type="button" className={'chip nocap' + (value === o.value ? ' on' : '')} aria-pressed={value === o.value}
      onClick={() => onChange(value === o.value ? undefined : o.value)}>{o.label}</button>)}
  </div>
}
// 1-10 as numbers to tap: a slider always shows a value, so it cannot say "not chosen" (spec 4.4)
function NumberRow({ value, onChange, labelledBy, lo, hi, each }) {
  return <>
    <div className="chips" role="group" aria-labelledby={labelledBy} style={{ flexWrap: 'wrap', overflowX: 'visible', gap: 6 }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <button key={n} type="button" className={'chip' + (value === n ? ' on' : '')}
        style={{ minWidth: 44, justifyContent: 'center' }} aria-pressed={value === n} aria-label={each(n)} onClick={() => onChange(value === n ? undefined : n)}>{n}</button>)}
    </div>
    <div className="row between small dim" style={{ gap: 12 }}><span>{lo}</span><span style={{ textAlign: 'right' }}>{hi}</span></div>
  </>
}
const Step = ({ title, children, sub }) => {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [title])
  return <>
    <h3 ref={ref} tabIndex={-1} style={{ outline: 'none' }}>{title}</h3>
    {sub && <div className="muted small" style={{ marginBottom: 12 }}>{sub}</div>}
    {children}
  </>
}
const Label = ({ id, children }) => <div className="small muted" id={id} style={{ margin: '14px 0 6px' }}>{children}</div>

/* ------------------------------------------------------------ breathing -- */
// Every cue is scheduled at once on the audio clock and as one vibration pattern, so the rhythm
// holds while the user looks away even if JS timers slow down; the text is re-read from the clock.
function Breathing({ cue, onDone }) {
  const [kind, setKind] = useState(null)
  const [start, setStart] = useState(null)
  const [, tick] = useState(0)
  const mix = useStore(s => s.S.winddown?.mix)
  const [sounds, setSounds] = useState(false)
  const plan = kind ? breathPlan(kind) : null
  // the Wind down sounds belong to the exercise only when it started them (a mix already playing is left alone)
  const ownSound = useRef(false)
  const endSound = () => { if (ownSound.current) { ownSound.current = false; noisePlayer().stop() } }
  const stop = () => { cancelBeeps(); vibrate(0); releaseWakeLock(); endSound(); setStart(null) }
  useEffect(() => () => { cancelBeeps(); vibrate(0); releaseWakeLock(); endSound() }, [])
  useEffect(() => { if (!start) return; const id = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(id) }, [start])
  const begin = () => {
    const sound = cue === 'both' || cue === 'sound', buzz = cue === 'both' || cue === 'vibrate'
    const tone = { in: 523, hold: 440, out: 392, hold2: 440, natural: 523, end: 660 }
    if (sound) for (const s of plan) beep(true, tone[s.phase], s.phase === 'end' ? 0.5 : 0.25, s.at)
    if (buzz) vibrate(vibratePattern(plan))
    if (sounds && mix) { const p = noisePlayer(); keepWindDown(p); bridgeWindDown(p); if (!p.get().playing) ownSound.current = p.play() }
    requestWakeLock(); setStart(Date.now())
  }
  const at = start && breathAt(plan, (Date.now() - start) / 1000)
  useEffect(() => { if (at?.done) { releaseWakeLock(); endSound(); setStart(null); onDone(kind) } }, [at?.done])
  if (start) return <div style={{ padding: '18px 0', textAlign: 'center' }}>
    <div aria-live="polite" style={{ fontSize: 28, fontWeight: 600 }}>{phaseLabel(at.phase)}</div>
    <div className="muted" style={{ fontSize: 22, margin: '6px 0' }} aria-hidden="true">{at.left}</div>
    {kind === 'box' && <div className="small dim">{t('Round {0} of {1}', at.round, 4)}</div>}
    <div style={{ height: 14 }} />
    <Button variant="tinted" icon="pause" onClick={stop}>{t('Stop')}</Button>
  </div>
  return <>
    <div className="muted small">{t('Look away from the screen. Sound or vibration will guide you.')}</div>
    <Label id="ci-breath">{t('Choose one')}</Label>
    <div role="group" aria-labelledby="ci-breath">
      <Segmented noneOk options={[{ value: 'box', label: t('Box breathing') }, { value: 'natural', label: t('Breathe naturally') }]} value={kind} onChange={setKind} />
    </div>
    {kind && <div className="small dim" style={{ marginTop: 6 }}>{kind === 'box' ? t('Breathe in for 4, hold for 4, out for 4, hold for 4. Four rounds, about a minute.') : t('A quiet minute. Breathe the way you normally do.')}</div>}
    {mix && <div className="row between" style={{ marginTop: 12 }}><span className="small">{t('Play my Wind down sounds')}</span><Switch checked={sounds} onChange={setSounds} aria-label={t('Play my Wind down sounds')} /></div>}
    {kind && <><div style={{ height: 12 }} /><Button variant="primary" icon="play" onClick={begin}>{t('Begin')}</Button></>}
  </>
}

/* ------------------------------------------------------------------ flow -- */
function Flow({ close, lockSheet }) {
  const st = useStore(s => s.S)
  const today = checkinDay()
  const carried = carriedNote(st.checkins, today), prev = followUpTarget(st.checkins, today)
  const [step, setStep] = useState(0)
  const [a, setA] = useState({})                 // the answers; only chosen fields ever appear
  const [keep, setKeep] = useState(null)         // carried note: 'done' | 'keep' | null
  const [happened, setHappened] = useState(null), [helped, setHelped] = useState(null)
  const [more, setMore] = useState({ patience: false, later: false, own: false })
  const [saved, setSaved] = useState(null)
  const set = patch => setA(x => { const y = { ...x, ...patch }; for (const k of Object.keys(y)) if (y[k] === undefined || y[k] === '') delete y[k]; return y })
  const dirty = Object.keys(a).length > 0 || keep || happened
  useEffect(() => { lockSheet(!!dirty && !saved) }, [dirty, saved])
  useEffect(() => { privacyScreen(true); return () => privacyScreen(false) }, [])   // private notes stay out of screenshots
  // however the sheet goes away (Close, Back, a swipe before any answer), a new check-in can open
  useEffect(() => { flowOpen = true; return () => { flowOpen = false } }, [])

  const leave = () => dirty && !saved
    ? confirmSheet({ title: t('Leave without saving?'), message: t('Nothing from this check-in will be saved.'), confirmText: t('Leave'), danger: true, onConfirm: () => { lockSheet(false); close() } })
    : close()
  // Skip clears that step's answers; on the last step it finishes without an activity
  const skip = () => {
    if (step === 4) return finish({ act: undefined, actOwn: undefined })
    const keys = [['mood', 'energy', 'patience'], ['stress', 'note', 'later']][step - 2]
    if (keys) set(Object.fromEntries(keys.map(k => [k, undefined])))
    setStep(step + 1)
  }
  const Nav = ({ primary, onPrimary = () => setStep(step + 1) }) => <>
    <div style={{ height: 16 }} />
    <Button variant="primary" onClick={onPrimary}>{primary || t('Next')}</Button>
    <div style={{ height: 6 }} />
    <Button variant="ghost" className="dim" onClick={step === 0 ? leave : skip}>{step === 0 ? t('Close') : t('Prefer to skip')}</Button>
  </>

  const finish = (over = {}) => {
    const ans = { ...a, ...over }
    const later = keep === 'keep' && carried && !ans.later ? carried : ans.later
    const entry = cleanEntry({ ...ans, later, d: today, at: Date.now() })
    update(s => {
      s.checkins = [...(s.checkins || []).filter(c => c.d !== today), entry].sort((x, y) => (x.d < y.d ? -1 : 1))
      if (prev && happened) {
        const e = s.checkins.find(c => c.d === prev.d)
        if (e) e.outcome = { happened, ...(happened !== 'no' && helped ? { helped } : {}) }
      }
      s.checkinPrefs = { ...s.checkinPrefs, skip: null }
    })
    const all = S().checkins, prefs = S().checkinPrefs
    const line = LOW_MOOD_LANGS.includes(getLang()) && lowMoodDue(all, prefs, today) ? 'low' : nudgeDue(all, prefs, today) ? 'nudge' : usefulDue(all, prefs) ? 'useful' : null
    if (line === 'low') update(s => { s.checkinPrefs.lowShown = today })
    if (line === 'nudge') update(s => { s.checkinPrefs.nudged = today.slice(0, 7) })
    if (line === 'useful') update(s => { s.checkinPrefs.askedUseful = all.length })
    lockSheet(false); setSaved({ entry, line }); setStep(6)
  }

  const tomorrow = (() => {
    if (!(st.routines || []).length) return null
    const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + 1)
    const r = effectiveRoutine(st, isoOf(d))
    return r ? t('Tomorrow: {0}', r.name) : t('Tomorrow: rest day')
  })()
  const recent = recentActivities(st.checkins)

  if (step === 0) return <Step title={t('End-of-day check-in')} sub={t('A few minutes to close your workday. Every step is optional.')}>
    {carried && <div className="card" style={{ marginTop: 4 }}>
      <div className="small muted">{t('From last time')}</div>
      <div style={{ margin: '4px 0' }}>{carried.concern}</div>
      {carried.next && <div className="small">{t('First step: {0}', carried.next)}</div>}
      <div role="group" aria-label={t('From last time')} style={{ marginTop: 8 }}>
        <Segmented noneOk options={[{ value: 'done', label: t('Done with it') }, { value: 'keep', label: t('Keep it for tomorrow') }]} value={keep} onChange={setKeep} />
      </div>
    </div>}
    {prev && <div className="card" style={{ marginTop: 10 }}>
      <div className="small" id="ci-fu">{t('Last time you planned: {0}', actLabel(prev.act, prev.actOwn))} {t('Did it happen?')}</div>
      <div role="group" aria-labelledby="ci-fu" style={{ marginTop: 6 }}>
        <Segmented noneOk options={[{ value: 'yes', label: t('Yes') }, { value: 'partly', label: t('Partly') }, { value: 'no', label: t('No') }]} value={happened} onChange={v => { setHappened(v); if (v === 'no') setHelped(null) }} />
      </div>
      {happened && happened !== 'no' && <>
        <div className="small" id="ci-help" style={{ marginTop: 8 }}>{t('Did it help?')}</div>
        <div role="group" aria-labelledby="ci-help" style={{ marginTop: 6 }}>
          <Segmented noneOk options={[{ value: 'yes', label: t('Yes') }, { value: 'little', label: t('A little') }, { value: 'no', label: t('No') }]} value={helped} onChange={setHelped} />
        </div>
      </>}
    </div>}
    <Nav />
  </Step>

  if (step === 1) return <Step title={t('Step away for a minute')}>
    <Breathing cue={st.checkinPrefs?.cue || 'both'} onDone={kind => { set({ breath: kind }); setStep(2) }} />
    <Nav />
  </Step>

  if (step === 2) return <Step title={t('How do you feel right now?')}>
    <Chips labelledBy="ci-mood" options={MOODS.map(m => ({ value: m, label: moodLabel(m) }))} value={a.mood} onChange={v => set({ mood: v })} />
    <Label id="ci-energy">{t('How much energy do you have left?')}</Label>
    <div className="small dim" style={{ marginTop: -2, marginBottom: 6 }}>{t('How you rate yourself, not a measurement.')}</div>
    <NumberRow labelledBy="ci-energy" value={a.energy} onChange={v => set({ energy: v })} lo={t('1 · very little energy left')} hi={t('10 · plenty of energy left')} each={n => t('Energy {0} of 10', n)} />
    {more.patience
      ? <><Label id="ci-pat">{t('How much patience do you have left?')}</Label>
        <NumberRow labelledBy="ci-pat" value={a.patience} onChange={v => set({ patience: v })} lo={t('1 · very little patience left')} hi={t('10 · plenty of patience left')} each={n => t('Patience {0} of 10', n)} /></>
      : <Button variant="plain" size="sm" icon="plus" onClick={() => setMore(m => ({ ...m, patience: true }))}>{t('Add patience (optional)')}</Button>}
    <Nav />
  </Step>

  if (step === 3) return <Step title={t('What weighed on you most today?')}>
    <Chips labelledBy="ci-stress" options={STRESSORS.map(m => ({ value: m, label: stressLabel(m) }))} value={a.stress} onChange={v => set({ stress: v })} />
    <div style={{ height: 8 }} />
    <TextArea rows={2} maxLength={NOTE_MAX} placeholder={t('A few words, if you like. No names needed.')} aria-label={t('A few words, if you like. No names needed.')} value={a.note || ''} onChange={e => set({ note: e.target.value })} />
    <div className="small dim" style={{ textAlign: 'right' }}>{t('{0} of 200', (a.note || '').length)}</div>
    {more.later || a.later
      ? <>
        <Label id="ci-later">{t('What can wait until tomorrow?')}</Label>
        <TextField maxLength={NOTE_MAX} aria-labelledby="ci-later" value={a.later?.concern || ''} onChange={e => set({ later: { ...a.later, concern: e.target.value } })} />
        <div style={{ height: 6 }} />
        <TextField maxLength={NOTE_MAX} placeholder={t('First step tomorrow (optional)')} aria-label={t('First step tomorrow (optional)')} value={a.later?.next || ''} onChange={e => set({ later: { ...a.later, next: e.target.value } })} />
      </>
      : <Button variant="plain" size="sm" icon="plus" onClick={() => setMore(m => ({ ...m, later: true }))}>{t('Leave something for tomorrow')}</Button>}
    <Nav />
  </Step>

  if (step === 4) return <Step title={t('What will you do after work tonight?')} sub={t('Pick one. It’s a plan, not a task to tick off.')}>
    {recent.length > 0 && <><Label id="ci-recent">{t('Recent')}</Label>
      <Chips labelledBy="ci-recent" options={recent.map(c => ({ value: c, label: actLabel(c) }))} value={a.act} onChange={v => set({ act: v, actOwn: undefined })} /></>}
    {Object.entries(ACT_GROUPS).map(([g, list]) => <div key={g}>
      <Label id={'ci-g-' + g}>{groupLabel(g)}</Label>
      <Chips labelledBy={'ci-g-' + g} options={list.map(c => ({ value: c, label: actLabel(c) }))} value={a.act} onChange={v => set({ act: v, actOwn: undefined })} />
    </div>)}
    <div style={{ height: 8 }} />
    {a.act === 'own' || more.own
      ? <TextField maxLength={OWN_MAX} placeholder={t('Your own idea')} aria-label={t('Your own idea')} value={a.actOwn || ''} onChange={e => set({ act: e.target.value.trim() ? 'own' : undefined, actOwn: e.target.value })} />
      : <Button variant="plain" size="sm" icon="plus" onClick={() => setMore(m => ({ ...m, own: true }))}>{t('Something else…')}</Button>}
    {tomorrow && <div className="card small muted" style={{ marginTop: 12 }}>{tomorrow}</div>}
    <Nav primary={t('Finish my workday')} onPrimary={() => finish()} />
  </Step>

  // step 6: closing
  const e = saved.entry, mix = st.winddown?.mix
  const startMix = () => askNotifications().then(() => {
    const p = noisePlayer(); keepWindDown(p); bridgeWindDown(p)
    p.restore(S().winddown || {}); p.setSleep(30); p.play() || toast(t('Sound can’t play on this device.'))
  })
  const answerUseful = v => { update(s => { const x = s.checkins.find(c => c.d === e.d); if (x) x.useful = v }); toast(t('Thanks. Your answer stays on this phone.')); setSaved(sv => ({ ...sv, line: null })) }
  return <Step title={t('Your workday is done.')}>
    {e.act && <div style={{ marginBottom: 8 }}>{t('Tonight: {0}', actLabel(e.act, e.actOwn))}</div>}
    {mix && <><Button variant="tinted" icon="moon" onClick={startMix}>{t('Start my Wind down mix with a 30 min sleep timer')}</Button><div style={{ height: 8 }} /></>}
    {saved.line === 'low' && <div className="card small" style={{ marginBottom: 8 }}>{t('You’ve rated your energy very low a few times lately. Talking to someone you trust, or to a doctor or counsellor, can help.')}</div>}
    {saved.line === 'nudge' && <div className="card small muted" style={{ marginBottom: 8 }}>{t('Your check-ins exist only on this phone. Back them up now and then: Settings → Export backup.')}</div>}
    {saved.line === 'useful' && <div className="card" style={{ marginBottom: 8 }}>
      <div className="small" id="ci-useful">{t('Was this useful?')}</div>
      <div className="row" role="group" aria-labelledby="ci-useful" style={{ gap: 8, marginTop: 6 }}>
        <Button size="sm" variant="tinted" onClick={() => answerUseful('yes')}>{t('Yes')}</Button>
        <Button size="sm" variant="tinted" onClick={() => answerUseful('no')}>{t('Not really')}</Button>
      </div>
    </div>}
    <Button variant="primary" onClick={close}>{t('Close')}</Button>
  </Step>
}

let flowOpen = false
export function openCheckin() {
  if (flowOpen) return
  if (S().active) { toast(t('Finish or discard your workout first.')); return }
  const go = () => {
    flowOpen = true   // set at once so a double tap can't open two; the Flow keeps it while mounted
    let h = null
    h = ui().openSheet(close => <Flow close={close} lockSheet={v => h?.lock(v)} />)
  }
  if (doneOn(S().checkins, checkinDay())) confirmSheet({ title: t('Replace today’s check-in?'), message: t('Your new answers replace the ones you saved today.'), confirmText: t('Replace'), onConfirm: go })
  else go()
}
// From a tapped reminder: wait for the saved state to load, show Home, then open
export function openCheckinFromReminder() {
  const run = () => { nav('/home'); setTimeout(openCheckin, 300) }
  if (useStore.getState().ready) return run()
  const off = useStore.subscribe(s => { if (s.ready) { off(); run() } })
}

/* ---------------------------------------------- settings and history -- */
function CheckinSettings() {
  const st = useStore(s => s.S)
  const p = st.checkinPrefs || {}, list = [...(st.checkins || [])].reverse()
  useEffect(() => { privacyScreen(true); return () => privacyScreen(false) }, [])
  const setPrefs = patch => update(s => { s.checkinPrefs = { ...s.checkinPrefs, ...patch } })
  const toggleDay = d => setPrefs({ days: p.days.includes(d) ? p.days.filter(x => x !== d) : [...p.days, d].sort() })
  const toggleRemind = async on => {
    setPrefs({ remind: on })
    if (on) { const ok = await syncCheckinReminder({ ...S(), checkinPrefs: { ...S().checkinPrefs, remind: true } }, true); if (!ok) toast(t('Notifications are off for OpenFettle')) }
  }
  const removeOne = d => confirmSheet({ title: t('Delete this check-in?'), message: fmtDate(d, true), confirmText: t('Delete'), danger: true, onConfirm: () => {
    update(s => { s.checkins = s.checkins.filter(c => c.d !== d); s.checkinPrefs = { ...s.checkinPrefs, deleted: [...(s.checkinPrefs.deleted || []), d] } }); toast(t('Check-in deleted'))
  } })
  const removeAll = () => confirmSheet({ title: t('Delete all check-ins?'), message: t('Deletes every check-in on this device. This cannot be undone.'), confirmText: t('Delete all check-ins'), danger: true, onConfirm: () => {
    update(s => { s.checkins = []; s.checkinPrefs = { ...s.checkinPrefs, cleared: Date.now(), deleted: [] } }); toast(t('All check-ins deleted'))
  } })
  return <>
    <h3>{t('End-of-day check-in')}</h3>
    <Button variant="primary" onClick={() => { ui().closeSheet?.(ui().sheets.at(-1)?.id); setTimeout(openCheckin, 250) }} disabled={!!st.active}>{t('Start now')}</Button>
    <Section title={t('Your workday')}>
      <div style={{ padding: '10px 14px' }}>
        <div className="chips" role="group" aria-label={t('Your workday')} style={{ flexWrap: 'wrap', overflowX: 'visible' }}>
          {[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} type="button" className={'chip' + (p.days?.includes(d) ? ' on' : '')} aria-pressed={!!p.days?.includes(d)} onClick={() => toggleDay(d)}>{t(DAYS[d])}</button>)}
        </div>
        <label className="row between" style={{ marginTop: 10 }}><span>{t('Usual end time')}</span>
          <input type="time" className="timef" value={p.end || '17:30'} onChange={e => e.target.value && setPrefs({ end: e.target.value })} /></label>
      </div>
      {MOBILE && <Row icon="bell" iconTint="var(--orange)" title={t('Remind me at my end time')}><Switch checked={!!p.remind} onChange={toggleRemind} aria-label={t('Remind me at my end time')} /></Row>}
    </Section>
    {MOBILE && <div className="small dim" style={{ margin: '-6px 4px 10px' }}>{t('One reminder at your end time on workdays. Not sent once you’ve checked in.')}</div>}
    <Section title={t('Breathing cues')}>
      <div style={{ padding: '10px 14px' }}><Segmented options={CUES.map(c => ({ value: c, label: cueLabel(c) }))} value={p.cue || 'both'} onChange={c => setPrefs({ cue: c })} /></div>
    </Section>
    <Section title={t('Your check-ins')} footer={t('Check-ins stay on this phone. They are included in Export backup.')}>
      {!list.length && <div className="small muted" style={{ padding: '12px 14px' }}>{t('No check-ins yet.')}</div>}
      {list.map(e => <Row key={e.d} title={fmtDate(e.d, true)} subtitle={summaryOf(e) || t('Workday finished')} accessory="chevron" onClick={() => ui().openSheet(close => <CheckinDetail e={e} close={close} onDelete={() => { close(); removeOne(e.d) }} />)} />)}
    </Section>
    {list.length > 0 && <Button variant="ghost" className="danger" onClick={removeAll}>{t('Delete all check-ins')}</Button>}
    <div style={{ height: 8 }} />
  </>
}
function CheckinDetail({ e, onDelete }) {
  useEffect(() => { privacyScreen(true); return () => privacyScreen(false) }, [])
  const rows = [
    [t('Feeling'), e.mood && moodLabel(e.mood)], [t('Energy'), e.energy && t('Energy {0} of 10', e.energy)], [t('Patience'), e.patience && t('Patience {0} of 10', e.patience)],
    [t('Main stressor'), e.stress && stressLabel(e.stress)], [t('Note'), e.note], [t('For tomorrow'), e.later && [e.later.concern, e.later.next].filter(Boolean).join(' → ')],
    [t('Tonight'), e.act && actLabel(e.act, e.actOwn)],
    [t('Did it happen?'), e.outcome && ({ yes: t('Yes'), partly: t('Partly'), no: t('No') }[e.outcome.happened] + (e.outcome.helped ? ' · ' + t('Did it help?') + ' ' + ({ yes: t('Yes'), little: t('A little'), no: t('No') }[e.outcome.helped]) : ''))]
  ].filter(r => r[1])
  return <>
    <h3>{fmtDate(e.d, true)}</h3>
    {!rows.length && <div className="muted small">{t('Workday finished')}</div>}
    {rows.map(([k, v]) => <div key={k} style={{ marginBottom: 8 }}><div className="small muted">{k}</div><div>{v}</div></div>)}
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="danger" icon="trash" onClick={onDelete}>{t('Delete check-in')}</Button>
  </>
}
export const checkinSettingsSheet = () => ui().openSheet(() => <CheckinSettings />)
