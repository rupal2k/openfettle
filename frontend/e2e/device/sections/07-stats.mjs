// Checklist 7: My Stats with data (tiles, heatmap, body weight, muscle map with hard sets) and
// History (a past workout, Delete asks first).
import { FACTS } from '../lib/fixtures.mjs'

export default {
  id: '07-stats', title: 'My Stats and History', fixture: 'trained',
  async run({ app, check }) {
    const p = app.page
    await app.go('stats')
    const st = await app.text('#app')
    check('the tiles count the workouts', new RegExp(`Workouts\\s*${FACTS.workouts}\\b`).test(st), st.slice(0, 80))
    check('the heatmap, body weight and muscle balance render', /Activity — last 12 months/.test(st) && /Body weight/.test(st) && /Muscle balance/.test(st))
    // the chart's axis is labelled around the one weigh-in (69 70 71)
    check('the body-weight chart is drawn around the logged weight', /\b69\b[\s\S]*\b70\b[\s\S]*\b71\b/.test(await p.locator('.card', { hasText: 'Body weight' }).first().innerText()))
    // the fixture's rated sets make the hard-sets view available: its toggle sits in the card's header
    const card = p.locator('.card', { hasText: 'Muscle balance' })
    const toggle = card.locator('.row.between').getByRole('button', { name: /^(All|Hard)$/ })
    check('the muscle map offers the hard-sets view', await toggle.count() === 1)
    if (await toggle.count()) {
      await app.tap(toggle, { after: 500 })
      check('switching shows the map by hard sets', /by hard sets/.test(await card.innerText()))
    }

    await app.go('history')
    await app.tap(p.getByText('Beginner A', { exact: true }).first(), { after: 1000 })
    const w = await app.waitSheet()
    check('History opens a past workout with its sets and records', /Squat|Press|Row/.test(w) && /PR|record/i.test(w), w.split('\n').slice(0, 2).join(' | '))
    await app.tap(app.sheet().getByRole('button', { name: /Delete/ }).first(), { after: 700 })
    const ask = await app.sheetText()
    check('Delete asks first', /Delete/.test(ask) && /\?/.test(ask), ask.split('\n')[0])
    await app.closeSheets()
    check('cancelling Delete keeps the workout', await app.workoutCount() === FACTS.workouts)
  },
}
