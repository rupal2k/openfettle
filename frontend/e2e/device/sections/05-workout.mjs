// Checklist 5 (standard workout): invalid sets refused, rest timer, screen kept on, finish with
// records, and the workout in History. Discard is in 05b.
import { sleep, waitFor } from '../lib/device.mjs'
import { FACTS } from '../lib/fixtures.mjs'

export default {
  id: '05-workout', title: 'Workout logging and the rest timer', fixture: 'trained',
  async run({ app, check }) {
    const p = app.page
    const done = async () => +((await app.text('#app')).match(/(\d+)\/\d+ sets/)?.[1] ?? -1)
    const field = (kind, i) => p.getByLabel(`${kind}, set ${i}`, { exact: true })
    const put = async (kind, i, v) => { const f = field(kind, i); await f.fill(String(v)); await f.blur(); await sleep(150) }
    const timer = p.locator('#timer')
    const clock = async () => { const m = (await timer.innerText()).match(/(\d+):(\d\d)/); return m ? +m[1] * 60 + +m[2] : NaN }
    const wake = async () => (await app.record()).wake

    await app.startTodaysWorkout()
    check('Home starts today’s routine', /Beginner A/.test(await app.text('#app')))
    check('the screen is kept on during the workout', await waitFor(async () => await wake() > 0, { timeout: 4000, label: 'a wake lock' }).catch(() => false))

    // a set with 0 kg can't be ticked, and says why
    await put('Weight (kg)', 1, 0); await put('Reps', 1, 10)
    await app.tap(p.getByLabel('Set 1 done', { exact: true }), { after: 800 })
    const guard = await app.sheets() ? await app.sheetText() : ''
    check('an invalid set (0 kg) is not logged, and the app says why', await done() === 0 && /not logged/i.test(guard), guard.split('\n')[0])
    await app.closeSheets()

    // a real set: the rest timer starts; +15, −15, Skip
    await put('Weight (kg)', 1, 16)
    await app.tap(p.getByLabel('Set 1 done', { exact: true }), { after: 1000 })
    check('a valid set ticks', await done() === 1)
    const t1 = await clock(); await app.tap(timer.getByRole('button', { name: '15 seconds more rest' }), { after: 300 }); const t2 = await clock()
    check('the rest timer starts by itself and +15 adds 15 s', t2 - t1 >= 13, `${t1} s → ${t2} s`)
    await app.tap(timer.getByRole('button', { name: '15 seconds less rest' }), { after: 300 }); const t3 = await clock()
    check('−15 takes 15 s off', t2 - t3 >= 14, `${t2} s → ${t3} s`)
    await app.tap(timer.getByRole('button', { name: 'Skip' }), { after: 600 })
    check('Skip ends the rest', !await timer.isVisible().catch(() => false))

    // the remaining sets: weights come pre-filled from the first set of each exercise
    let prefilled = true
    for (let k = 0; k < 80; k++) {
      if (await app.sheets()) {
        const s = await app.sheetText()
        if (/Save & next/.test(s)) { await app.tap(app.sheet().getByRole('button', { name: /Save & next/ }), { after: 800 }); continue }
        break   // the finish sheet, or something unexpected: handled below
      }
      if (await timer.isVisible().catch(() => false)) await app.tap(timer.getByRole('button', { name: 'Skip' }), { after: 300 })
      const open = p.locator('button.chk:not(.on)')
      if (!await open.count()) {
        const next = p.getByRole('button', { name: 'Next', exact: true })
        if (await next.isEnabled().catch(() => false)) { await app.tap(next, { after: 700 }); continue }
        break
      }
      const i = (await open.first().getAttribute('aria-label')).match(/Set (\d+)/)[1]
      const w = field('Weight (kg)', i)
      if (await w.count() && !(+(await w.inputValue()) > 0)) { if (+i > 1) prefilled = false; await put('Weight (kg)', i, 12) }
      const r = field('Reps', i)
      if (await r.count() && !(+(await r.inputValue()) > 0)) await put('Reps', i, 10)
      await app.tap(open.first(), { after: 400 })
    }
    const logged = (await app.text('#app')).match(/(\d+)\/(\d+) sets/)
    check('every set logged', logged && logged[1] === logged[2], logged?.[0])
    check('after the first set, weights are pre-filled', prefilled)

    // finish: records and e1RM, then the screen may turn off again
    let fin = await app.sheets() ? await app.sheetText() : ''
    if (!/record|PR|1RM/i.test(fin)) { await app.tapButton('Finish', app.main(), { after: 1200 }); fin = await app.sheetText() }
    for (let k = 0; k < 3 && !/record|PR|1RM/i.test(fin); k++) {
      const go = app.sheet().locator('button.primary').first()
      if (!await go.count()) break
      await app.tap(go, { after: 1500 }); fin = await app.sheetText()
    }
    check('finishing shows records and e1RM', /record|PR|1RM/i.test(fin), fin.slice(0, 120))
    await app.closeSheets()
    check('the screen wake lock is let go after the finish', await waitFor(async () => await wake() === 0, { timeout: 5000, label: 'the wake lock to go' }).catch(() => false), `${await wake()} held`)
    check('the finished workout is in History', await app.workoutCount() === FACTS.workouts + 1, `${FACTS.workouts} → ${await app.workoutCount()}`)
  },
}
