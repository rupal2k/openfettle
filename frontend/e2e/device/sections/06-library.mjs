// Checklist 6: search, body-part and equipment filters, the detail sheet, adding to a routine,
// a custom exercise, and the ready-made workout chips.
import { sleep, waitFor } from '../lib/device.mjs'
import { readState } from '../lib/app.mjs'

export default {
  id: '06-library', title: 'Exercises library', fixture: 'trained',
  async run({ app, check }) {
    const p = app.page, sheet = () => app.sheet()
    const list = () => app.text('#app .list')
    const search = p.getByPlaceholder(/Search/)
    await app.go('library')

    await search.fill('squat')
    check('search finds exercises', await waitFor(async () => /Squat/.test(await list()), { timeout: 4000, label: 'squats' }).catch(() => false))
    await search.fill(''); await sleep(500)

    await app.tapButton(/^Body part/, app.main())
    await app.tap(sheet().getByText(/^(Chest|Pectorals)$/).first(), { after: 700 }); await app.closeSheets()
    const chest = await list()
    check('the body-part filter narrows the list', /Pectorals|Chest/.test(chest) && !/Quads/.test(chest), (chest.match(/[^\n]*· [^\n]*/g) || []).slice(0, 2).join(' ; '))
    await app.tapButton(/^Body part/, app.main()); await app.tap(sheet().getByText(/^All$/).first(), { after: 500 }); await app.closeSheets()

    await app.tapButton(/^Equipment/, app.main())
    await app.tap(sheet().getByText(/^Dumbbell$/).first(), { after: 700 }); await app.closeSheets()
    const db = await list()
    check('the equipment filter narrows the list', /Dumbbell/.test(db) && !/Barbell/.test(db), (db.match(/[^\n]*· [^\n]*/g) || []).slice(0, 2).join(' ; '))
    await app.tapButton(/^Equipment/, app.main()); await app.tap(sheet().getByText(/^Any$/).first(), { after: 500 }); await app.closeSheets()

    // detail sheet and its animation
    const situp = p.locator('#app .list .item').filter({ hasText: 'Sit-Up' }).first()
    await app.tap(situp.locator('.grow'), { after: 1200 })
    const anim = await waitFor(() => sheet().locator('img').evaluateAll(is => is.some(i => i.complete && i.naturalWidth > 0)), { timeout: 8000, label: 'the animation' }).catch(() => false)
    check('the detail sheet opens with its animation', anim, (await app.sheetText()).split('\n')[0])
    await app.closeSheets()

    // Plan: offers the routines and adds the exercise to one
    await app.tap(situp.getByRole('button', { name: 'Plan' }), { after: 800 })
    const add = await app.waitSheet(/Beginner B/)
    check('Plan offers the routines to add the exercise to', /Beginner A/.test(add) && /Beginner B/.test(add))
    await app.tap(sheet().getByText('Beginner B', { exact: true }).first(), { after: 1000 })
    await app.tapButton('Add to routine', sheet(), { after: 1000 })   // the sets/reps sheet that follows
    await app.closeSheets()
    const b = readState().routines.find(r => r.name === 'Beginner B')
    check('the exercise is now in that routine', b.ex.length === 7, `${b.ex.length} exercises (6 before)`)

    // a custom exercise (a name no fixture holds)
    const name = 'Regression press ' + Date.now().toString(36)
    await app.go('library')
    await app.tapText('Create your own exercise', app.main())
    await app.waitSheet(/Create your own exercise/)
    await sheet().getByLabel('Exercise name').fill(name)
    await app.tap(sheet().locator('button.chip', { hasText: /^chest$/i }), { after: 200 })
    await app.tapButton('Create exercise', sheet(), { after: 800 })
    await search.fill(name)
    // the app title-cases names ("Regression Press …")
    check('a custom exercise is created and can be found', await waitFor(async () => (await list()).toLowerCase().includes(name.toLowerCase()), { timeout: 4000, label: name }).catch(() => false))
    await search.fill('')

    // ready-made workouts
    await app.tap(app.main().getByRole('button', { name: 'Gym', exact: true }).first(), { after: 800 })
    check('a "Ready-made workouts" chip opens the plan catalogue', /Workout plan templates/.test(await app.sheetText()))
  },
}
