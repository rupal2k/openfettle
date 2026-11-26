// "Things that can help" (1.9): suggestions under a Self-check result. The rules themselves are unit
// tested (src/lib/move.test.js); this checks what the phone shows and that every button does its job.
import { waitFor, sleep } from '../lib/device.mjs'
import { writeState, readState } from '../lib/app.mjs'
import { fixtures, iso } from '../lib/fixtures.mjs'

const DAY = 864e5
const PHQ = (total, harm = 0) => { const a = Array(9).fill(0); for (let i = 0; i < 8 && total > 0; i++) { a[i] = Math.min(3, total); total -= a[i] } a[8] = harm; return a }
const result = (inst, a, extra = {}) => ({ id: 'ofreg-' + inst, inst, d: iso(Date.now() - DAY), at: Date.now() - DAY, a, ...extra })
const withResults = (list, patch = {}) => ({ ...fixtures.trained(), selfchecks: list, selfcheckPrefs: { region: 'in', deleted: [], cleared: null, hiddenTips: [] }, ...patch })

export default {
  id: '15-tips', title: 'Things that can help', fixture: 'trained',
  async run(t) {
    const { check } = t
    let app = t.app
    const seed = async state => { writeState(state); app = await t.relaunch() }
    const openResult = async inst => {
      await app.go('stats')
      await app.tap(app.page.locator('.lrow', { hasText: inst }).first(), { after: 1000 })
      return app.waitSheet(new RegExp(inst))
    }
    const cards = () => app.sheet().locator('.tip-card')
    const card = name => app.sheet().locator('.tip-card', { hasText: name })
    const openHub = async () => { await app.go('stats'); await app.tap(app.page.locator('.lab-entry', { hasText: 'Self-checks' }), { after: 1000 }); return app.waitSheet(/Questionnaires/) }

    // low mood (PHQ-9 12): walk, strength, Mobility & Core, with a source and the safety line
    await seed(withResults([result('phq9', PHQ(12))]))
    let s = await openResult('PHQ-9')
    check('a low-mood result shows "Things that can help"', /Things that can help/.test(s))
    check('… walk, strength and Mobility & Core', (await cards().allInnerTexts()).map(x => x.split('\n')[0]).join(' | ') === 'Brisk walk, 10 minutes, 3 times this week | Strength training twice a week | Mobility & Core, about 15 minutes')
    check('… with the week’s active minutes from the workouts', /Last 7 days: \d+ of 150 active minutes/.test(s))
    check('… a source and the safety line', /Source: Noetel et al\., BMJ 2024/.test(s) && /ask a doctor before starting harder exercise/.test(s))
    check('the support card comes before the suggestions', s.indexOf('Talk to someone') >= 0 && s.indexOf('Talk to someone') < s.indexOf('Things that can help'))

    // Mobility & Core: Start adds the plan (week unchanged) and starts it
    const week0 = JSON.stringify(readState().week)
    await app.tap(card('Mobility & Core').getByRole('button', { name: 'Start', exact: true }), { after: 1500 })
    if (await app.sheets() && /weigh|weight/i.test(await app.sheetText())) await app.tapText('Start without weighing in', null, { after: 1200 })
    check('Start on Mobility & Core starts that session', await waitFor(async () => (await app.route()).startsWith('workout'), { timeout: 6000, label: 'the workout' }).then(() => true, () => false) && /Mobility & Core/.test(await app.text('#app')))
    check('… and leaves the weekly schedule alone', JSON.stringify(readState().week) === week0)
    await app.discardWorkout()

    // strength: the trained fixture has routines, so it offers the last one
    s = await openResult('PHQ-9')
    check('strength offers the routine last trained', await card('Strength training').getByRole('button', { name: /^Start Beginner A$/ }).count() === 1)

    // Brisk walk (phase 2): 10, 20 or 30 minutes; the first tap makes the routine and starts it, a second reuses it
    s = await openResult('PHQ-9')
    check('the walk can start at 10, 20 or 30 minutes', (await card('Brisk walk').getByRole('button', { name: /^Walk \d+ min$/ }).allInnerTexts()).join(' | ') === 'Walk 10 min | Walk 20 min | Walk 30 min')
    await app.tap(card('Brisk walk').getByRole('button', { name: 'Walk 10 min' }), { after: 1500 })
    if (await app.sheets() && /weigh|weight/i.test(await app.sheetText())) await app.tapText('Start without weighing in', null, { after: 1200 })
    const started = await waitFor(async () => (await app.route()).startsWith('workout'), { timeout: 6000, label: 'the workout' }).then(() => true, () => false)
    const wtext = await app.text('#app')
    check('Walk 10 min starts a Brisk walk session', started && /Brisk walk/.test(wtext) && /Cardio/.test(wtext), (await app.route()) + ' · ' + wtext.replace(/\s+/g, ' ').slice(0, 160))
    const walks = () => readState().routines.filter(r => r.name === 'Brisk walk').length
    check('… as a cardio routine outside the weekly schedule', walks() === 1 && readState().customEx.some(c => c.n === 'Brisk walk' && c.bp === 'cardio') && JSON.stringify(readState().week) === week0)
    await app.discardWorkout()
    await openResult('PHQ-9')
    await app.tap(card('Brisk walk').getByRole('button', { name: 'Walk 20 min' }), { after: 1500 })
    if (await app.sheets() && /weigh|weight/i.test(await app.sheetText())) await app.tapText('Start without weighing in', null, { after: 1200 })
    await waitFor(async () => (await app.route()).startsWith('workout'), { timeout: 6000, label: 'the workout' }).catch(() => {})
    check('… Walk 20 min starts at 20 minutes', await waitFor(() => readState().active?.entries?.[0]?.sets?.[0]?.min === 20, { timeout: 5000, label: 'a 20-minute set' }).then(() => true, () => false))
    check('… and a second walk reuses the routine', walks() === 1)
    await app.discardWorkout()

    // the hub: "Suggested for you" above the questionnaires
    let hub = await openHub()
    check('the Self-checks hub starts with "Suggested for you"', hub.indexOf('Suggested for you') >= 0 && hub.indexOf('Suggested for you') < hub.indexOf('Questionnaires'))
    await app.closeSheets()

    // Hide this: gone, and still gone after a restart
    await openResult('PHQ-9')
    await app.tap(card('Brisk walk').getByRole('button', { name: 'Hide this' }), { after: 500 })
    check('Hide this removes the card', await card('Brisk walk').count() === 0)
    // the app writes its file a moment after a change: restart once the hide is saved
    check('… the hide is saved on the phone', await waitFor(() => readState().selfcheckPrefs?.hiddenTips?.includes('walk'), { timeout: 5000, label: 'the saved hide' }).then(() => true, () => false))
    app = await t.relaunch()
    await openResult('PHQ-9')
    check('… and it stays hidden after a restart', await card('Brisk walk').count() === 0 && await cards().count() === 2)
    await app.closeSheets()

    // a self-harm answer with a low total: support first, suggestions folded and gentle only
    await seed(withResults([result('phq9', PHQ(3, 1))]))
    s = await openResult('PHQ-9')
    check('a self-harm answer: suggestions are folded under "When you feel ready"', /When you feel ready/.test(s) && await cards().count() === 0)
    check('… below the safety card', s.indexOf('thoughts of being better off dead') < s.indexOf('Things that can help'))
    await app.tap(app.sheet().getByRole('button', { name: /When you feel ready/ }), { after: 400 })
    check('… opened: the walk can be started, 10 minutes only', (await card('A 10-minute walk').getByRole('button', { name: /^Walk/ }).allInnerTexts()).join() === 'Walk 10 min')
    check('… opened: only a short walk and gentle stretching', (await cards().allInnerTexts()).map(x => x.split('\n')[0]).join(' | ') === 'A 10-minute walk outside | Mobility & Core, about 15 minutes' && !/150|Strength/.test(await app.sheetText()))
    await app.closeSheets()

    hub = await openHub()
    check('the hub puts the helplines before the suggestions, which stay folded', hub.indexOf('Questionnaires') < hub.indexOf('Talk to someone') && hub.indexOf('Talk to someone') < hub.indexOf('Suggested for you') && /When you feel ready/.test(hub) && await app.sheet().locator('.tip-card').count() === 0)
    await app.closeSheets()

    // since the last check (phase 2): sessions and minutes between two results of the same check
    const two = withResults([result('phq9', PHQ(14)), result('phq9', PHQ(8))])
    two.selfchecks[0] = { ...two.selfchecks[0], id: 'ofreg-phq9-old', d: iso(Date.now() - 15 * DAY), at: Date.now() - 15 * DAY }
    await seed(two)
    s = await openResult('PHQ-9')
    const since = s.match(/Since your last check · Sessions: (\d+) · Active minutes: (\d+)/)
    check('a repeat result says what was done since the last one', !!since && +since[1] > 0, since?.[0] || s.slice(0, 200))
    await app.closeSheets()

    // anxiety: box breathing opens and runs (its beeps are counted in the page)
    await seed(withResults([result('gad7', [2, 2, 2, 1, 1, 0, 0])]))
    await openResult('GAD-7')
    check('an anxiety result leads with box breathing', /^Box breathing, about a minute/.test((await cards().first().innerText())))
    check('… and the walk says to build up gradually', /Hard intervals raise your heart rate like anxiety can/.test(await card('Brisk walk').innerText()))
    await app.tap(card('Box breathing').getByRole('button', { name: 'Begin' }), { after: 1200 })
    check('… Begin opens the breathing exercise', /Box breathing/.test(await app.waitSheet(/Box breathing/).catch(() => '')))
    await app.tap(app.sheet().getByRole('button', { name: 'Box breathing' }), { after: 300 })
    const b0 = (await app.record()).beeps
    await app.tapButton('Begin', app.sheet(), { after: 1500 })
    check('… and runs', (await app.record()).beeps > b0)
    await app.tapButton('Stop', app.sheet(), { after: 500 })
    await app.closeSheets()

    // risky drinking: Wind down opens
    await seed(withResults([result('auditc', [4, 4, 4], { sex: 'm' })]))
    await openResult('AUDIT-C')
    await app.tap(card('An evening routine').getByRole('button', { name: 'Wind down' }), { after: 1200 })
    check('a drinking result offers an evening routine that opens Wind down', /Fire|Water|Night/.test(await app.waitSheet().catch(() => '')))
    await app.closeSheets()
    await openResult('AUDIT-C')
    check('… and a short walk', await card('An evening routine').getByRole('button', { name: 'Walk 10 min' }).count() === 1)
    await app.closeSheets()

    // strength with no routines: the app doesn't know where they train, so both beginner plans
    await seed({ ...withResults([result('idrs', [2, 2, 1, 0], { sex: 'm' })]), routines: [], week: {}, workouts: [] })
    await openResult('Indian Diabetes')
    const sb = await card('Strength training').getByRole('button').allInnerTexts()
    check('no routines: strength offers the gym and the home beginner plan', sb.includes('Beginner Full Body (3‑day)') && sb.includes('Home Bodyweight Full Body (3‑day)'), sb.join(' | '))
    await app.tap(card('Strength training').getByRole('button', { name: 'Home Bodyweight Full Body (3‑day)' }), { after: 1500 })
    check('… the home plan goes into My Plan, the week stays empty', await waitFor(() => readState().routines.filter(r => /^Bodyweight [ABC]$/.test(r.name)).length === 3, { timeout: 5000, label: 'the plan' }).then(() => true, () => false) && JSON.stringify(readState().week) === '{}' && (await app.route()).startsWith('plan'))

    // "Were these suggestions useful?" (phase 3): asked once, on the second result taken that shows suggestions
    await seed(withResults([]))
    const takeAudit = async () => {
      await openHub()
      await app.tap(app.sheet().locator('.lrow', { hasText: 'AUDIT-C' }), { after: 1000 })
      await app.waitSheet(/drink/i)
      await app.tap(app.sheet().locator('[aria-labelledby=sc-sex]').getByRole('button', { name: 'Man' }), { after: 200 })
      for (let i = 0; i < 3; i++) await app.tap(app.sheet().locator(`[aria-labelledby=sc-q${i}] .chip`).nth(4), { after: 200 })
      await app.tapButton('See my result', app.sheet(), { after: 1200 })
    }
    await takeAudit()
    check('the first result with suggestions doesn’t ask', /An evening routine/.test(await app.sheetText()) && !/Were these suggestions useful/.test(await app.sheetText()))
    check('… but is counted', await waitFor(() => readState().selfcheckPrefs?.tipsShown === 1, { timeout: 5000, label: 'the count' }).then(() => true, () => false))
    await app.closeSheets()
    await takeAudit()
    check('the second one asks whether the suggestions were useful', /Were these suggestions useful\?/.test(await app.sheetText()))
    await app.tapButton('Yes', app.sheet(), { after: 600 })
    check('… the answer is kept on the phone', await waitFor(() => readState().selfcheckPrefs?.tipsUseful === 'yes' && readState().selfcheckPrefs.tipsAsked, { timeout: 5000, label: 'the saved answer' }).then(() => true, () => false))
    await app.closeSheets()
    await openResult('AUDIT-C')
    check('… and not asked again', !/Were these suggestions useful/.test(await app.sheetText()))
    await app.closeSheets()

    // another language: mental-health suggestions wait for review; diabetes ones show
    await seed(withResults([result('gad7', [2, 2, 2, 1, 1, 0, 0]), result('idrs', [2, 2, 1, 0], { sex: 'm' })], { lang: 'hi' }))
    await app.go('stats')
    await app.tap(app.page.locator('.lrow', { hasText: 'GAD-7' }).first(), { after: 1000 })
    const hi = (await cards().allInnerTexts()).map(x => x.split('\n')[0])
    check('Hindi: no anxiety suggestion until reviewed; the diabetes-backed walk shows', !hi.some(x => /बॉक्स/.test(x)) && hi.some(x => /तेज़ चाल/.test(x)), hi.join(' | '))
    await app.closeSheets()

    // Home never shows a suggestion
    await app.go('home')
    check('Home shows no suggestion', !/जो मदद कर सकता है|Things that can help/.test(await app.text('#app')))
    await sleep(100)
  },
}
