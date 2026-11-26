// Self-checks on Home (how many are due, never which or their scores) and the latest results on My Stats, which stays
// out of screenshots while results show (1.8.3).
import { screencap, contrast, waitFor } from '../lib/device.mjs'
import { writeState } from '../lib/app.mjs'
import { fixtures, iso } from '../lib/fixtures.mjs'

export default {
  id: '13-selfchecks', title: 'Self-checks on Home and My Stats', fixture: 'selfchecks',
  async run(t) {
    let { app, check } = t
    const p = app.page
    await app.go('home')
    const card = p.locator('.wind-card', { hasText: 'Self-checks' })
    const ct = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ')
    check('Home shows the Self-checks card', await card.count() === 1, ct)
    check('the card says how many checks are due, not which or their scores', /Due · 1 questionnaire$/.test(ct) && !/WHO-5|PHQ|out of/.test(ct), ct)
    check('TalkBack hears that a check is due', await p.getByRole('button', { name: /Self-checks.*Due · 1 questionnaire/ }).count() === 1)
    check('Home can be screenshotted', contrast(screencap()) > 10)
    await app.tap(card)
    check('the card opens Self-checks', /Questionnaires/.test(await app.waitSheet(/Questionnaires/)))
    await app.closeSheets()

    await app.go('stats')
    const rows = p.locator('.lrow', { hasText: 'Last:' })
    const texts = (await rows.allInnerTexts()).map(r => r.replace(/\s+/g, ' '))
    check('My Stats lists the latest result of each check taken', texts.length === 2 && /WHO-5.*Due · Last: .* 32 out of 100/.test(texts[0]) && /PHQ-9.*8 out of 27/.test(texts[1]), texts.join(' | '))
    check('a result worth a closer look is orange', await p.locator('.lrow.sc-high', { hasText: 'WHO-5' }).count() === 1 && await p.locator('.lrow.sc-high', { hasText: 'PHQ-9' }).count() === 0)
    await rows.last().scrollIntoViewIfNeeded()
    check('My Stats is blocked from screenshots while results show', await waitFor(() => contrast(screencap()) < 2, { timeout: 4000, label: 'a black screenshot' }).catch(() => false))
    await app.tap(rows.first())
    const full = await app.waitSheet(/32 out of 100/)
    check('a result opens in full', /Below 50/.test(full) && /Delete result/.test(full))
    await app.closeSheets()
    check('still blocked after the result closes', contrast(screencap()) < 2)
    await app.go('library')
    check('screenshots work again after leaving My Stats', await waitFor(() => contrast(screencap()) > 10, { timeout: 4000, label: 'a normal screenshot' }).catch(() => false))

    // a PHQ-9 with a self-harm answer but a low total is flagged too
    const s = fixtures.selfchecks()
    s.selfchecks.push({ id: 'ofreg-phq9-harm', inst: 'phq9', d: iso(), at: Date.now(), a: [0, 0, 0, 0, 0, 0, 0, 0, 1] })
    writeState(s); app = await t.relaunch()
    await app.go('stats')
    check('a self-harm answer is flagged on My Stats whatever the total', await app.page.locator('.lrow.sc-high', { hasText: 'PHQ-9' }).count() === 1, (await app.page.locator('.lrow', { hasText: 'PHQ-9' }).innerText()).replace(/\s+/g, ' '))
  },
}
