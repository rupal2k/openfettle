// Checklist 4: template groups, interval plans leave the week alone, the routine editor's Format,
// and the floating Start on a routine's page.
import { waitFor } from '../lib/device.mjs'

export default {
  id: '04-plan', title: 'My Plan', fixture: 'trained',
  async run({ app, check }) {
    const p = app.page
    const week = async () => { await app.go('plan'); return (await app.text('#app')).split('Routines')[0].replace(/\s+/g, ' ') }
    const w0 = await week()

    await app.tapButton('Templates', app.main())
    await app.waitSheet(/Workout plan templates/)
    for (const tab of ['Gym', 'At home', 'Home gym', 'Intervals']) {
      await app.tap(app.sheet().getByRole('button', { name: tab, exact: true }), { after: 400 })
      // each group shows its selected plan with a Load button
      const load = app.sheet().getByRole('button', { name: /^Load/ })
      check(`template group "${tab}" offers a plan to load`, await load.count() === 1, (await load.first().innerText().catch(() => '')).replace(/\s+/g, ' '))
    }
    // the Intervals tab is open: load its first plan
    const load = app.sheet().getByRole('button', { name: /^Load/ }).first()
    const what = (await load.innerText()).replace(/\s+/g, ' ')
    await app.tap(load, { after: 1200 })
    await app.closeSheets()
    check('loading an interval plan leaves the week as it was', await week() === w0, what)

    // the routine editor of the AMRAP routine: Format offers all four, AMRAP has a time cap and its own rest
    await app.tapText('AMRAP 15', app.main(), { after: 1000 })
    check('a routine opens its own page', /^plan\/r\//.test(await app.route()), await app.route())
    await app.tapText('Format', app.main())
    const fmts = await app.waitSheet()
    check('Format offers Standard, Tabata, EMOM and AMRAP', ['Standard', 'Tabata', 'EMOM', 'AMRAP'].every(f => fmts.includes(f)), fmts.replace(/\s+/g, ' ').slice(0, 100))
    await app.closeSheets()
    const ed = await app.text('#app')
    check('the AMRAP routine shows its time cap and its own rest', /cap|Time limit|minutes/i.test(ed) && /Rest/.test(ed))

    // floating Start on this page starts this routine
    await app.tap(p.locator('#startfab'), { after: 1200 })
    if (await app.sheets() && /weigh|weight/i.test(await app.sheetText())) await app.tapText('Start without weighing in', null, { after: 1200 })
    await waitFor(async () => (await app.route()).startsWith('workout'), { label: 'the workout', timeout: 6000 }).catch(() => {})
    check('the floating Start on a routine page starts that routine', (await app.route()).startsWith('workout') && /AMRAP 15/.test(await app.text('#app')))
    await app.discardWorkout()
  },
}
