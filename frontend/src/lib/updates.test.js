import { describe, it, expect } from 'vitest'
import { isNewer, checkForUpdate, dueForCheck, DAY_MS } from './updates.js'

const res = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 403, json: async () => body })

describe('update check', () => {
  it('compares versions numerically', () => {
    expect(isNewer('1.6.10', '1.6.9')).toBe(true)
    expect(isNewer('v1.7.0', '1.6.2')).toBe(true)
    expect(isNewer('1.6.2', '1.6.2')).toBe(false)
    expect(isNewer('1.6.1', '1.6.2')).toBe(false)
    expect(isNewer('2.0', '1.9.9')).toBe(true)
  })
  it('reports a newer release and its page', async () => {
    const r = await checkForUpdate('1.6.2', res({ tag_name: 'v1.6.3', html_url: 'https://github.com/rupal2k/openfit/releases/tag/v1.6.3' }))
    expect(r).toEqual({ latest: '1.6.3', url: 'https://github.com/rupal2k/openfit/releases/tag/v1.6.3', newer: true })
  })
  it('accepts release pages under the new repo name', async () => {
    const page = 'https://github.com/rupal2k/openfettle/releases/tag/v1.7.0'
    expect((await checkForUpdate('1.6.2', res({ tag_name: 'v1.7.0', html_url: page }))).url).toBe(page)
  })
  it('asks the renamed repo for releases', async () => {
    let asked = ''
    await checkForUpdate('1.6.2', async (url) => { asked = url; return { ok: true, json: async () => ({ tag_name: 'v1.7.0' }) } })
    expect(asked).toBe('https://api.github.com/repos/rupal2k/openfettle/releases/latest')
  })
  it('never links outside this project', async () => {
    const r = await checkForUpdate('1.6.2', res({ tag_name: 'v9.0.0', html_url: 'https://evil.example/x' }))
    expect(r.url).toBe('https://github.com/rupal2k/openfettle/releases/latest')
    const lookalike = await checkForUpdate('1.6.2', res({ tag_name: 'v9.0.0', html_url: 'https://github.com/rupal2k/openfettle-evil/x' }))
    expect(lookalike.url).toBe('https://github.com/rupal2k/openfettle/releases/latest')
  })
  it('fails on an error response or a tag that is not a version', async () => {
    await expect(checkForUpdate('1.6.2', res({}, false))).rejects.toThrow()
    await expect(checkForUpdate('1.6.2', res({ tag_name: 'nightly' }))).rejects.toThrow()
  })
  it('checks automatically at most once a day', () => {
    expect(dueForCheck(null)).toBe(true)
    expect(dueForCheck(1000, 1000 + DAY_MS - 1)).toBe(false)
    expect(dueForCheck(1000, 1000 + DAY_MS)).toBe(true)
  })
})
