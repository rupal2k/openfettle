// Self-checks (docs/specs/2026-11-19-self-checks.md): the list, taking a questionnaire, the result
// and the private history. Pure logic and the questionnaires are in lib/selfcheck.js.
import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { t, getLang } from './lib/i18n.js'
import { fmtDate, todayISO } from './lib/format.js'
import { privacyScreen } from './lib/mobile.js'
import { latestByMarker } from './lib/labs/reports.js'
import { INSTRUMENTS, INST_IDS, AUDIT_CUT, band, shown, skipped, selfHarm, waistIndex, ageIndex, ageFromYear, regionOf, lastOf, dueOn, dueChecks } from './lib/selfcheck.js'
import { confirmSheet } from './sheets.jsx'
import { Button, Segmented, Section, Row, NumberField } from './components/ui.jsx'
import Icon from './components/Icon.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const openUrl = url => window.open(url, '_blank', 'noopener')
// Unfinished answers, kept in memory only (never saved) so closing a questionnaire by mistake loses nothing
const drafts = {}
const usePrivate = () => useEffect(() => { privacyScreen(true); return () => privacyScreen(false) }, [])

const ABOUT = { who5: () => t('Wellbeing over the last two weeks · 2 min'), phq9: () => t('Low mood over the last two weeks · 2 min'), gad7: () => t('Anxiety over the last two weeks · 1 min'), auditc: () => t('Alcohol · 1 min'), idrs: () => t('Type 2 diabetes risk · 1 min · made for people of Indian origin') }
const nameOf = inst => INSTRUMENTS[inst].verbatim ? INSTRUMENTS[inst].name : t(INSTRUMENTS[inst].name)
const scoreLine = e => t('{0} out of {1}', shown(e), e.inst === 'who5' ? 100 : INSTRUMENTS[e.inst].max)
const LINKS = {
  ada: 'https://diabetes.org/risk-test',
  hearwho: 'https://www.who.int/teams/noncommunicable-diseases/sensory-functions-disability-and-rehabilitation/hearwho',
  whoeyes: 'https://www.who.int/teams/noncommunicable-diseases/sensory-functions-disability-and-rehabilitation/whoeyes',
  helpline: 'https://findahelpline.com'
}

// Helplines for where the user lives: India's national line, else the free global directory
function Support({ region, footer }) {
  return <Section title={t('Talk to someone')} footer={footer || (region === 'in' ? t('In an emergency, call 112.') : t('In an emergency, call your local emergency number.'))}>
    {region === 'in'
      ? <Row icon="phone" iconTint="var(--indigo)" title={t('Tele-MANAS 14416')} subtitle={t('Free mental health helpline from the Government of India, 24 hours, in many Indian languages')} accessory="chevron" onClick={() => { window.location.href = 'tel:14416' }} />
      : <Row icon="globe" iconTint="var(--indigo)" title={t('Find a helpline')} subtitle={t('Free helplines in over 130 countries (findahelpline.com)')} accessory="chevron" onClick={() => openUrl(LINKS.helpline)} />}
  </Section>
}

// PHQ-9 item 9 above "Not at all": shown under the question as soon as it is answered, and first on the result
// announce: read out by screen readers as it appears (not when an old result is reopened)
function SafetyCard({ region, announce }) {
  return <div role={announce ? 'alert' : undefined} style={{ marginTop: 10 }}>
    <div className="card" style={{ borderLeft: '3px solid var(--orange)', marginBottom: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('You said you have had thoughts of being better off dead or of hurting yourself.')}</div>
      <div className="small">{t('Thank you for answering honestly. You don’t have to handle these thoughts alone. Please talk to someone today: a helpline, a doctor, or someone you trust.')}</div>
    </div>
    <Support region={region} footer={region === 'in'
      ? t('If you might act on these thoughts, call 112 now or go to the nearest hospital emergency department.')
      : t('If you might act on these thoughts, call your local emergency number now or go to the nearest emergency department.')} />
  </div>
}

/* ---------------------------------------------------------------- hub -- */
function SelfChecks() {
  usePrivate()
  const st = useStore(s => s.S)
  const list = st.selfchecks || [], region = regionOf(st.selfcheckPrefs), today = todayISO()
  const results = [...list].reverse()
  const removeAll = () => confirmSheet({ title: t('Delete all results?'), message: t('Deletes every self-check result on this device. This cannot be undone.'), confirmText: t('Delete all results'), danger: true, onConfirm: () => {
    update(s => { s.selfchecks = []; s.selfcheckPrefs = { ...s.selfcheckPrefs, cleared: Date.now(), deleted: [] } }); for (const k in drafts) delete drafts[k]; toast(t('All results deleted'))
  } })
  return <>
    <h3>{t('Self-checks')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Short questionnaires that doctors and researchers use. They can point to something worth checking; they can’t diagnose anything. Your answers stay on this phone.')}</div>
    <Section title={t('Questionnaires')}>
      {INST_IDS.map(inst => {
        const last = lastOf(list, inst), due = dueOn(list, inst, today)
        return <Row key={inst} title={nameOf(inst)} subtitle={(due ? t('Due') + ' · ' : '') + (last ? t('Last: {0} · {1}', fmtDate(last.d), scoreLine(last)) : ABOUT[inst]())}
          accessory="chevron" onClick={() => takeSheet(inst)} />
      })}
    </Section>
    <Section title={t('More checks')} footer={t('These open other websites and apps.')}>
      <Row icon="globe" iconTint="var(--teal)" title={t('American Diabetes Association risk test')} subtitle={t('Type 2 diabetes risk for other populations')} accessory="chevron" onClick={() => openUrl(LINKS.ada)} />
      <Row icon="globe" iconTint="var(--teal)" title={t('hearWHO (hearing)')} subtitle={t('Free WHO app · needs earphones')} accessory="chevron" onClick={() => openUrl(LINKS.hearwho)} />
      <Row icon="globe" iconTint="var(--teal)" title={t('WHOeyes (vision)')} subtitle={t('Free WHO app · near and distance vision')} accessory="chevron" onClick={() => openUrl(LINKS.whoeyes)} />
    </Section>
    <Support region={region} />
    <Section title={t('Where you live')} footer={t('Sets the helplines and drink sizes shown.')}>
      <div style={{ padding: '10px 14px' }}>
        <Segmented options={[{ value: 'in', label: t('India') }, { value: 'intl', label: t('Another country') }]} value={region}
          onChange={v => update(s => { s.selfcheckPrefs = { ...s.selfcheckPrefs, region: v } })} />
      </div>
    </Section>
    <Section title={t('Your results')} footer={t('Results stay on this phone. They are included in Export backup.')}>
      {!results.length && <div className="small muted" style={{ padding: '12px 14px' }}>{t('No results yet.')}</div>}
      {results.map(e => <Row key={e.id} title={nameOf(e.inst)} subtitle={fmtDate(e.d, true) + ' · ' + scoreLine(e)} accessory="chevron"
        onClick={() => ui().openSheet(close => <Detail e={e} close={close} />)} />)}
    </Section>
    {results.length > 0 && <Button variant="ghost" className="danger" onClick={removeAll}>{t('Delete all results')}</Button>}
    <div style={{ height: 8 }} />
  </>
}

/* -------------------------------------------------------- one check -- */
const profileSex = () => ({ female: 'f', male: 'm' }[S().nutrition?.profile?.sex] || null)
const profileAgeIndex = () => ageFromYear(S().nutrition?.profile?.birthYear, new Date().getFullYear())

function Take({ inst }) {
  usePrivate()
  const [n, setN] = useState(0)
  // one heading for the sheet's life: the dialog is named after it when it opens (Modals.jsx)
  return <><h3>{nameOf(inst)}</h3><TakeForm key={n} inst={inst} restart={() => { delete drafts[inst]; setN(n + 1) }} /></>
}

function TakeForm({ inst, restart }) {
  const I = INSTRUMENTS[inst], region = regionOf(S().selfcheckPrefs)
  const [d] = useState(() => drafts[inst])   // the draft as it was when the form opened (the effect below keeps updating drafts)
  const [a, setA] = useState(() => d?.a || I.items.map((_, i) => (inst === 'idrs' && i === 0 ? profileAgeIndex() : null)))
  const [sex, setSex] = useState(() => (d ? d.sex : profileSex()))
  const [waist, setWaist] = useState(d?.waist ?? null), [inch, setInch] = useState(d?.inch ?? false)
  const [saved, setSaved] = useState(null)
  const resumed = !!d && !saved
  const start = useRef(JSON.stringify([a, sex, waist, inch]))   // prefilled answers alone aren't a draft
  useEffect(() => { if (!saved && JSON.stringify([a, sex, waist, inch]) !== start.current) drafts[inst] = { a, sex, waist, inch } }, [a, sex, waist, inch, saved])
  // switching units converts what was typed, so 86 cm doesn't become 86 in
  const setUnit = v => { if (v !== inch) setWaist(w => (w == null ? w : Math.round((v ? w / 2.54 : w * 2.54) * 10) / 10)); setInch(v) }
  const cm = waist && (inch ? waist * 2.54 : waist), cmOk = cm >= 40 && cm <= 200   // a typo can't set the band
  const answers = inst === 'idrs' ? a.map((v, i) => (i === 1 ? (cmOk && sex ? waistIndex(cm, sex) : null) : v)) : a
  const done = answers.every((v, i) => v != null || skipped(inst, answers, i)) && (!I.needsSex || sex)
  const pick = (i, v) => setA(x => x.map((y, j) => (j === i ? v : y)))
  const save = () => {
    const at = Date.now(), e = { id: inst + '-' + at, inst, d: todayISO(), at, a: answers.map(v => v ?? 0) }
    if (I.needsSex) e.sex = sex
    update(s => { s.selfchecks = [...(s.selfchecks || []), e] })
    delete drafts[inst]; setSaved(e)
  }
  if (saved) return <Result e={saved} noTitle />
  const label = s => (I.verbatim ? s : t(s))
  return <>
    {resumed && <div className="card small row" style={{ marginBottom: 8, gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{t('Your earlier answers are kept until you see your result.')}</span>
      <Button variant="plain" size="sm" style={{ flex: 'none', whiteSpace: 'nowrap' }} onClick={restart}>{t('Start again')}</Button>
    </div>}
    {I.verbatim && getLang() !== 'en' && <div className="small dim" style={{ marginBottom: 8 }}>{t('Shown in English, the wording it was tested in.')}</div>}
    {I.intro && <div className="muted small" style={{ marginBottom: 8 }}>{I.intro}</div>}
    {inst === 'auditc' && <div className="card small" style={{ marginBottom: 8 }}>{region === 'in'
      ? t('One drink is 10 g of alcohol: a small peg (30 ml) of whisky, rum or vodka, a 100 ml glass of wine, or a 250 ml glass of beer. A large peg (60 ml) is two drinks.')
      : t('One drink is 10 g of alcohol: a 30 ml shot of spirits, a 100 ml glass of wine, or a 250 ml glass of beer. Your country may count drinks differently.')}</div>}
    {I.needsSex && <>
      <div className="small muted" id="sc-sex" style={{ margin: '14px 0 6px' }}>{t('The cut-offs differ for women and men')}</div>
      <div role="group" aria-labelledby="sc-sex"><Segmented noneOk options={[{ value: 'f', label: t('Woman') }, { value: 'm', label: t('Man') }]} value={sex} onChange={setSex} /></div>
    </>}
    {I.items.map((it, i) => skipped(inst, answers, i) ? null : <div key={i}>
      <div className="small" id={'sc-q' + i} style={{ margin: '16px 0 6px', fontWeight: 600 }}>{(i + 1) + '. ' + label(it.q)}</div>
      {it.waist
        ? <>
          <div className="small dim" style={{ marginBottom: 6 }}>{t('Measure around your bare waist, midway between your lowest rib and the top of your hip bone, after breathing out.')}</div>
          <div className="row" style={{ gap: 8 }}>
            <NumberField nullable className="input" value={waist} onChange={setWaist} placeholder={inch ? '34' : '86'} aria-labelledby={'sc-q' + i} style={{ maxWidth: 110 }} />
            <Segmented className="seg-inline" options={[{ value: false, label: 'cm' }, { value: true, label: 'in' }]} value={inch} onChange={setUnit} />
          </div>
          {waist != null && !cmOk && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>{t('Enter a waist between 40 and 200 cm (16 and 79 in)')}</div>}
        </>
        : <div className="chips" role="group" aria-labelledby={'sc-q' + i} style={{ flexWrap: 'wrap', overflowX: 'visible' }}>
          {it.opts.map((o, j) => <button key={j} type="button" className={'chip nocap' + (a[i] === j ? ' on' : '')} aria-pressed={a[i] === j}
            style={{ flex: '0 1 auto', maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' }}
            onClick={() => pick(i, a[i] === j ? null : j)}>{label(o.label)}</button>)}
        </div>}
      {i === 8 && selfHarm(inst, a) && <SafetyCard region={region} announce />}
    </div>)}
    <div style={{ height: 16 }} />
    <Button variant="primary" disabled={!done} onClick={save}>{t('See my result')}</Button>
    {!done && <div className="small dim" style={{ marginTop: 6 }}>{t('Answer every question to see your result.')}</div>}
  </>
}

/* ----------------------------------------------------------- result -- */
function resultText(e) {
  const b = band(e).code
  if (e.inst === 'who5') return b === 'low'
    ? t('Below 50. That has been suggested as a sign of low wellbeing, and a reason to talk it over with a doctor or counsellor. It is not a diagnosis.')
    : t('50 or above. Higher scores mean better wellbeing. Take it again in two weeks to see how it changes.')
  if (e.inst === 'auditc') return b === 'none' ? t('You don’t drink alcohol.')
    : b === 'over' ? t('At or above the usual cut-off ({0} or more). Your drinking may be harming your health. A doctor can help you look at it, and cutting down helps at any point.', AUDIT_CUT[e.sex])
      : t('Below the usual cut-off for risky drinking ({0} or more).', AUDIT_CUT[e.sex])
  if (e.inst === 'phq9' || e.inst === 'gad7') return {
    minimal: t('Minimal (0 to 4). Take it again in two weeks to see how it changes.'),
    mild: t('Mild (5 to 9). Keep an eye on it and take it again in two weeks. If it doesn’t ease, talk it over with a doctor or counsellor.'),
    moderate: e.inst === 'phq9'
      ? t('Moderate (10 to 14). 10 or more is the usual sign of depression worth looking at. Please talk it over with a doctor or counsellor. It is not a diagnosis.')
      : t('Moderate (10 to 14). 10 or more is the usual sign of anxiety worth looking at. Please talk it over with a doctor or counsellor. It is not a diagnosis.'),
    modsevere: t('Moderately severe (15 to 19). Please see a doctor or counsellor soon. Depression can be treated, and help works. It is not a diagnosis.'),
    severe: e.inst === 'phq9'
      ? t('Severe (20 to 27). Please see a doctor or counsellor soon. Depression can be treated, and help works. It is not a diagnosis.')
      : t('Severe (15 to 21). Please see a doctor or counsellor soon. Anxiety can be treated, and help works. It is not a diagnosis.')
  }[b]
  return b === 'low' ? t('Low risk (under 30). Staying active keeps it that way.')
    : b === 'moderate' ? t('Moderate risk (30 to 50). More activity and a smaller waist lower it. Ask a doctor whether a blood sugar test makes sense for you.')
      : t('High risk (60 or more). Ask a doctor for a blood sugar test (HbA1c or fasting glucose). Only a blood test can show diabetes.')
}

function Result({ e, onDelete, noTitle }) {
  const st = useStore(s => s.S)
  const I = INSTRUMENTS[e.inst], b = band(e), region = regionOf(st.selfcheckPrefs)
  const prev = (st.selfchecks || []).filter(x => x.inst === e.inst && x.at < e.at).sort((x, y) => x.at - y.at).at(-1)
  const harm = selfHarm(e.inst, e.a), diff = prev ? (shown(e) > shown(prev) ? '+' : '') + (shown(e) - shown(prev)) : ''
  const a1c = e.inst === 'idrs' && latestByMarker(st.labs?.reports || []).find(x => x.key === 'diabetes.hba1c')
  return <>
    {!noTitle && <h3>{nameOf(e.inst)}</h3>}
    <div className="small muted">{fmtDate(e.d, true)}</div>
    {harm && <SafetyCard region={region} announce={!onDelete} />}
    <div style={{ fontSize: 28, fontWeight: 600, margin: '8px 0', color: b.level === 'high' ? 'var(--orange)' : undefined }}>{scoreLine(e)}</div>
    {I.everyDays > 0 && prev && <div className="small muted" style={{ marginBottom: 6 }}>{e.inst === 'who5' ? t('Change since last time: {0} (higher is better)', diff) : t('Change since last time: {0} (lower is better)', diff)}</div>}
    <div style={{ marginBottom: 10 }}>{resultText(e)}</div>
    {a1c && <div className="card small" style={{ marginBottom: 10 }}>{t('Your latest HbA1c in Labs: {0}% ({1}). A measured value tells you more than a risk score.', a1c.m.v, fmtDate(a1c.report.d))}</div>}
    {b.level === 'high' && I.mental && !harm && <Support region={region} />}
    <div className="small dim" style={{ margin: '10px 0' }}>{t('Source: {0}', I.source)}</div>
    <Button variant="plain" size="sm" icon="link" onClick={() => openUrl(I.url)}>{t('About this questionnaire')}</Button>
    {onDelete && <><div style={{ height: 8 }} /><Button variant="ghost" className="danger" icon="trash" onClick={onDelete}>{t('Delete result')}</Button></>}
  </>
}

function Detail({ e, close }) {
  usePrivate()
  const remove = () => { close(); confirmSheet({ title: t('Delete this result?'), message: nameOf(e.inst) + ' · ' + fmtDate(e.d, true), confirmText: t('Delete'), danger: true, onConfirm: () => {
    update(s => { s.selfchecks = s.selfchecks.filter(x => x.id !== e.id); s.selfcheckPrefs = { ...s.selfcheckPrefs, deleted: [...(s.selfcheckPrefs.deleted || []), e.id] } }); toast(t('Result deleted'))
  } }) }
  return <Result e={e} onDelete={remove} />
}

const takeSheet = inst => ui().openSheet(() => <Take inst={inst} />)
export const selfChecksSheet = () => ui().openSheet(() => <SelfChecks />)

// Home card: names only (never scores), so Home stays safe to screenshot
export function SelfChecksHomeCard({ S }) {
  const due = dueChecks(S.selfchecks, todayISO())
  // no aria-label: TalkBack reads the title and which checks are due
  return <button type="button" className="card tappable wind-card" onClick={selfChecksSheet}>
    <span className="lrow-i" style={{ '--tint': 'var(--indigo)' }}><Icon name="clipboard" /></span>
    <span className="wind-m">
      <span className="wind-t">{t('Self-checks')}</span>
      <span className="muted small">{due.length ? t('Due') + ' · ' + due.map(nameOf).join(', ') : t('Wellbeing, mood, anxiety, alcohol and diabetes risk questionnaires')}</span>
    </span>
    <Icon name="chevronRight" className="chev" />
  </button>
}

// My Stats: the latest result of each questionnaire taken; scores on screen, so the screen goes private
function StatsResults({ list }) {
  usePrivate()
  const today = todayISO()
  return <Section>
    {INST_IDS.map(inst => lastOf(list, inst)).filter(Boolean).map(e => {
      // a self-harm answer is flagged whatever the total, as the result sheet's support card is
      const high = band(e).level === 'high' || selfHarm(e.inst, e.a)
      return <Row key={e.inst} title={nameOf(e.inst)} accessory="chevron"
        subtitle={(dueOn(list, e.inst, today) ? t('Due') + ' · ' : '') + t('Last: {0} · {1}', fmtDate(e.d), scoreLine(e))}
        className={high ? 'sc-high' : ''} onClick={() => ui().openSheet(close => <Detail e={e} close={close} />)} />
    })}
  </Section>
}
export function SelfChecksStatsCard({ S }) {
  const list = S.selfchecks || []
  return <>
    <button type="button" className="card lab-entry" onClick={selfChecksSheet}>
      <span className="lrow-i" style={{ '--tint': 'var(--indigo)' }}><Icon name="clipboard" /></span>
      <span><b>{t('Self-checks')}</b><br /><span className="muted small">{t('Wellbeing, mood, anxiety, alcohol and diabetes risk questionnaires')}</span></span>
      <Icon name="chevronRight" />
    </button>
    {list.length > 0 && <StatsResults list={list} />}
  </>
}
