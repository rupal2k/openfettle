// Wind down and the End-of-day check-in: a mix plays with its notification service and Pause
// stops both; breathing with "Play my Wind down sounds" stops its sound on Stop and on leaving;
// a mix the user already had playing is left alone.
import { grepOnPhone, shell, uid, waitFor, sleep, PKG } from '../lib/device.mjs'

export default {
  id: '14-winddown', title: 'Wind down and the check-in breathing', fixture: 'trained',
  async run({ app, check }) {
    const sheet = () => app.sheet()
    const u = uid()
    // playback states of the debug app only (filtered on the phone by its uid)
    const playing = () => /state:started/.test(grepOnPhone('dumpsys audio', `u/pid:${u}/`))
    const service = () => /WindDownService/.test(shell('dumpsys', 'activity', 'services', PKG))
    const until = (fn, label, timeout = 6000) => waitFor(fn, { timeout, label }).then(() => true, () => false)
    const windDown = async () => { await app.go('settings'); await app.tap(app.main().getByRole('button', { name: /^Wind down/ }).first(), { after: 900 }) }

    // a mix: Fire on, Play → sound + notification service; Pause → both stop
    await windDown()
    const fire = sheet().locator('button.chip', { hasText: /^Fire$/ })
    if (await fire.getAttribute('aria-pressed') !== 'true') await app.tap(fire, { after: 300 })
    if (await sheet().getByRole('button', { name: 'Play' }).count()) await app.tapButton('Play', sheet())
    check('Wind down plays, with its notification service', await until(() => playing() && service(), 'sound and service'))
    await app.tapButton('Pause', sheet())
    check('Pause stops the sound and the service', await until(() => !playing() && !service(), 'silence'))
    await app.closeSheets()

    const toBreathing = async () => {
      await app.go('settings'); await app.tap(app.main().getByRole('button', { name: /^End-of-day check-in/ }).first(), { after: 800 })
      await app.tapButton('Start now', sheet(), { after: 1000 })
      if (await sheet().getByRole('button', { name: 'Replace' }).count()) await app.tapButton('Replace', sheet(), { after: 1000 })
      await app.tapButton('Next', sheet(), { after: 400 })
      await app.tapButton('Box breathing', sheet(), { after: 300 })
      const sw = sheet().getByLabel('Play my Wind down sounds')
      if (await sw.getAttribute('aria-checked') !== 'true') await app.tap(sw, { after: 200 })
      await app.tapButton('Begin', sheet(), { after: 1000 })
    }
    await toBreathing()
    check('breathing plays the Wind down sounds', await until(() => playing() && service(), 'sound'))
    await app.tapButton('Stop', sheet())
    check('Stop stops the sound and the service', await until(() => !playing() && !service(), 'silence'))
    await app.tapButton('Begin', sheet())
    await until(() => playing(), 'sound again')
    await app.page.keyboard.press('Escape'); await sleep(800)
    const leave = app.page.locator('[role=dialog] button', { hasText: /^Leave$/ })
    if (await leave.count()) await app.tap(leave.last(), { after: 800 })
    await app.closeSheets()
    check('leaving mid-exercise stops the sound', await until(() => !playing() && !service(), 'silence'))

    // the user's own mix keeps playing after a breathing exercise stops
    await windDown(); await app.tapButton('Play', sheet()); await until(() => playing(), 'the mix'); await app.closeSheets()
    await toBreathing()
    await app.tapButton('Stop', sheet()); await sleep(2000)
    check('Stop leaves the user’s own mix playing', playing() && service())
    await app.closeSheets()
    await windDown(); if (await sheet().getByRole('button', { name: 'Pause' }).count()) await app.tapButton('Pause', sheet())
    check('nothing is playing at the end', await until(() => !playing(), 'silence'))
  },
}
