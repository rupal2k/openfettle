// Checklist 3: Home on a fresh install (welcome card, plans) and with a plan (hero, week, weigh-in).
import { waitFor } from '../lib/device.mjs'

export default {
  id: '03-home', title: 'Home on a fresh install', fixture: 'fresh',
  async run({ app, check }) {
    const p = app.page
    await app.go('home')
    const home = await app.text('#app')
    check('the welcome card offers gym, home and home-gym plans', /At a gym/.test(home) && /At home, no equipment/.test(home) && /Home gym/.test(home))
    await app.tapText('At a gym')
    const catalog = await app.waitSheet(/Load/)
    check('the gym pick lists beginner plans first', /Beginner/i.test(catalog.slice(0, 400)), catalog.slice(0, 80))
    await app.tap(app.sheet().getByRole('button', { name: /^Load/ }), { after: 1200 })
    await app.closeSheets()
    check('loading a plan goes to My Plan', (await app.route()).startsWith('plan'), await app.route())

    await app.go('home')
    const hero = await p.locator('button.hero').innerText()
    check('the hero card shows today (a routine or a rest day)', /TODAY/i.test(hero), hero.replace(/\n/g, ' | '))
    check('the week strip marks the planned days', await p.locator('.wday.plan, .wday.ovr').count() > 0, `${await p.locator('.wday.plan').count()} planned`)
    check('the welcome card is gone once a plan is loaded', !/Welcome!/.test(await app.text('#app')))

    await app.tap(p.locator('.card', { hasText: 'Body weight' }).getByRole('button', { name: 'Log' }))
    await app.waitSheet()
    const save = (await app.sheet().getByRole('button', { name: /^Save/ }).first().innerText()).trim()
    check('the first weigh-in button names the weight', /^Save \d/.test(save), save)
    await app.tap(app.sheet().getByRole('button', { name: /^Save/ }), { after: 1000 })
    check('the weigh-in shows on Home', await waitFor(async () => /\d\s*kg/.test(await p.locator('.card', { hasText: 'Body weight' }).first().innerText()), { timeout: 4000, label: 'the weight' }).catch(() => false))
  },
}
