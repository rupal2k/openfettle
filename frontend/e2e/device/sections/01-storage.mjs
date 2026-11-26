// Checklist 1: data is restored on a cold start and the last change survives a force-stop.
import { FACTS } from '../lib/fixtures.mjs'
import { readState } from '../lib/app.mjs'

export default {
  id: '01-storage', title: 'Launch and storage', fixture: 'trained',
  async run(t) {
    let { app, check } = t
    check('cold start restores the saved workouts', await app.workoutCount() === FACTS.workouts, `${FACTS.workouts} expected`)
    await app.go('home')
    const bw = () => app.page.locator('.card', { hasText: 'Body weight' }).first().innerText()
    check('cold start restores the weigh-in', /70\s*kg/.test(await bw()))
    // a new weigh-in, then force-stop at once
    await app.tap(app.page.locator('.card', { hasText: 'Body weight' }).getByRole('button', { name: 'Log' }))
    await app.waitSheet(/Log body weight/)
    await app.tap(app.sheet().getByRole('button', { name: '+1', exact: true }), { after: 200 })
    await app.tap(app.sheet().getByRole('button', { name: '+0.5', exact: true }), { after: 200 })   // 70 → 71.5
    await app.tap(app.sheet().getByRole('button', { name: /^Save/ }), { after: 1200 })
    check('the new weigh-in is written to the file', readState().bodyweight.some(b => b.w === 71.5))
    app = await t.relaunch()
    await app.go('home')
    check('after a force-stop the last change is still there', /71[.,]5\s*kg/.test(await bw()), (await bw()).split('\n').slice(0, 3).join(' '))
  },
}
