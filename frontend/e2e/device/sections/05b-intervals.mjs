// Checklist 5 (intervals): Tabata's work clock runs and ends with a beep and vibration, EMOM marks
// each minute, AMRAP counts rounds, and Discard logs nothing. The beeps and vibrations are the
// app's own calls, counted in the page.
import { sleep, waitFor } from '../lib/device.mjs'
import { FACTS } from '../lib/fixtures.mjs'

async function startRoutine(app, name) {
  await app.go('plan')
  await app.tapText(name, app.main(), { after: 900 })
  await app.tap(app.page.locator('#startfab'), { after: 1200 })
  if (await app.sheets() && /weigh|weight/i.test(await app.sheetText())) await app.tapText('Start without weighing in', null, { after: 1200 })
  await waitFor(async () => (await app.route()).startsWith('workout'), { label: name + ' started' })
}
const clockText = async app => ((await app.text('#app')).match(/\b\d{1,2}:\d\d\b/g) || []).join(',')

export default {
  id: '05b-intervals', title: 'Tabata, EMOM, AMRAP and Discard', fixture: 'trained',
  async run({ app, check }) {
    const p = app.page
    const rec = () => app.record()

    // Tabata: 20 s of work counts down by itself, then beeps and vibrates
    await startRoutine(app, 'Tabata Express')
    const r0 = await rec()
    await app.tap(p.getByRole('button', { name: 'Start set' }), { after: 1500 })
    const c1 = await clockText(app); await sleep(2500); const c2 = await clockText(app)
    check('the Tabata work clock runs by itself', c1 && c1 !== c2, `${c1} → ${c2}`)
    const r1 = await waitFor(async () => { const r = await rec(); return r.vibrate.length > r0.vibrate.length && r.beeps > r0.beeps && r }, { timeout: 30000, label: 'the end of the work part' }).catch(() => rec())
    check('the end of a work part beeps and vibrates', r1.vibrate.length > r0.vibrate.length && r1.beeps > r0.beeps, `vibrations ${r0.vibrate.length} → ${r1.vibrate.length}, beeps ${r0.beeps} → ${r1.beeps}`)
    await app.discardWorkout()

    // EMOM: the turn of the minute beeps and vibrates
    await startRoutine(app, 'EMOM 20')
    await app.tap(p.getByRole('button', { name: 'Start set' }).first(), { after: 800 })
    const e0 = await rec(), t0 = Date.now()
    const e1 = await waitFor(async () => { const r = await rec(); return r.vibrate.length > e0.vibrate.length && r }, { timeout: 70000, every: 1000, label: 'the next minute' }).catch(() => rec())
    check('EMOM: the next minute starts with a vibration and a beep', e1.vibrate.length > e0.vibrate.length && e1.beeps > e0.beeps, `after ${((Date.now() - t0) / 1000).toFixed(0)} s: vibrations ${e0.vibrate.length} → ${e1.vibrate.length}, beeps ${e0.beeps} → ${e1.beeps}`)
    await app.discardWorkout()

    // AMRAP: the clock runs, Round done ticks one set of every exercise in the round
    await startRoutine(app, 'AMRAP 15')
    const sets = async () => +((await app.text('#app')).match(/(\d+)\/\d+ sets/)?.[1] ?? -1)
    await app.tap(p.getByRole('button', { name: /^Start the .* clock$/ }), { after: 1500 })
    const a1 = await clockText(app); await sleep(2500); const a2 = await clockText(app)
    check('the AMRAP clock runs', a1 && a1 !== a2, `${a1} → ${a2}`)
    const perRound = await p.locator('.exhead, .ex-card, [data-ex]').count() || null
    const s0 = await sets()
    await app.tapButton('Round done', app.main(), { after: 600 })
    const s1 = await sets()
    await app.tapButton('Round done', app.main(), { after: 600 })
    const s2 = await sets()
    check('Round done ticks one set of each exercise, every round', s1 > s0 && s2 - s1 === s1 - s0, `sets done ${s0} → ${s1} → ${s2}${perRound ? ` (${perRound} exercises)` : ''}`)

    // Discard: nothing is logged
    await app.discardWorkout()
    check('Discard logs nothing', await app.workoutCount() === FACTS.workouts)
  },
}
