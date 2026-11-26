// Checklist 10: languages (Hindi, Chinese, back to English), kg/lb is a label switch only, the
// workout reminder schedules alarms, and effort per set adds an RIR column.
import { grepOnPhone, waitFor, PKG } from '../lib/device.mjs'
import { FACTS } from '../lib/fixtures.mjs'

export default {
  id: '10-settings', title: 'Settings: language, units, reminder, effort', fixture: 'trained',
  async run({ app, check }) {
    const p = app.page, sheet = () => app.sheet()
    const language = async label => {
      await app.go('settings')
      await app.tap(app.main().locator('button.lrow').filter({ hasText: /Language|भाषा|语言/ }).first(), { after: 700 })
      await app.tap(sheet().getByText(label, { exact: true }).first(), { after: 1200 })
      await app.closeSheets()
    }
    await language('हिन्दी')
    check('Hindi: the app re-renders in Hindi', /[ऀ-ॿ]{3,}/.test(await app.text('#tabbar')), await app.text('#tabbar'))
    await app.go('library')
    await app.tap(p.locator('#app .list .item').filter({ hasText: 'Sit-Up' }).first().locator('.grow'), { after: 1200 })
    check('Hindi: exercise instructions are in Hindi', /[ऀ-ॿ]{10,}/.test(await app.sheetText()))
    await app.closeSheets()
    await language('中文')
    check('Chinese: tabs and screens re-render in Chinese', /[一-鿿]/.test(await app.text('#tabbar')) && /[一-鿿]{2,}/.test(await app.text('#app')), await app.text('#tabbar'))
    await language('English')
    check('back to English', /My Plan/.test(await app.text('#tabbar')))

    // kg → lb: the label changes, the logged numbers stay
    const vol = async () => { await app.go('history'); return (await app.text('#app')).match(/([\d,]+) (kg|lb)/)?.slice(1) }
    const [n0, u0] = await vol()
    await app.go('settings'); await app.tapButton('lb', app.main(), { after: 800 })
    if (await app.sheets()) { const keep = sheet().getByRole('button', { name: /Keep|label|No/i }).first(); if (await keep.count()) await app.tap(keep, { after: 600 }) }
    const [n1, u1] = await vol()
    check('switching kg → lb changes the label only', u0 === 'kg' && u1 === 'lb' && n0 === n1, `${n0} ${u0} → ${n1} ${u1}`)
    await app.go('settings'); await app.tapButton('kg', app.main(), { after: 800 })
    if (await app.sheets()) { const keep = sheet().getByRole('button', { name: /Keep|label|No/i }).first(); if (await keep.count()) await app.tap(keep, { after: 600 }) }

    // reminder: alarms for the planned weekdays (alarm lines filtered on the phone to the debug app)
    // pending alarms only ("… #n: Alarm{… <package>}"); the dump also keeps a history of delivered ones
    const alarms = () => grepOnPhone('dumpsys alarm', PKG).split(/\r?\n/).filter(l => /#\d+: Alarm\{/.test(l)).length
    const a0 = alarms()
    const sw = app.main().locator('.lrow').filter({ hasText: 'Workout day reminder' }).locator('[role=switch], button').last()
    await app.tap(sw, { after: 1500 })
    check('turning the reminder on schedules alarms', await waitFor(() => alarms() > a0, { timeout: 5000, label: 'alarms' }).catch(() => false), `${a0} → ${alarms()} alarm lines`)
    await app.tap(sw, { after: 1500 })
    check('turning it off removes them', await waitFor(() => alarms() <= a0, { timeout: 5000, label: 'alarms gone' }).catch(() => false), `${alarms()} alarm lines`)

    // effort per set: an RIR column in the workout; history untouched
    await app.go('settings'); await app.tapButton('RIR', app.main(), { after: 600 })
    await app.startTodaysWorkout()
    check('effort RIR: the workout gets an RIR column', /\bRIR\b/.test(await app.text('#app')))
    await app.discardWorkout()
    await app.go('settings'); await app.tap(app.main().getByRole('button', { name: 'Off', exact: true }).first(), { after: 600 })
    check('History is unchanged by the effort setting', await app.workoutCount() === FACTS.workouts)
  },
}
