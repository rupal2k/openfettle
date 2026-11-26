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
import { confirmSheet, startFlow, addPlanRoutines, walkRoutine, windDownSheet } from './sheets.jsx'
import { breathingSheet } from './checkin-sheets.jsx'
import { tipsFor, reasonsShown, sinceLast } from './lib/move.js'
import { nav } from './lib/nav.js'
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

/* ------------------------------------------------ things that can help -- */
// docs/specs/2026-11-26-move-for-your-mind.md. The rules are in lib/move.js; here they get words,
// a source and a button that does it. Plans go into My Plan without touching the weekly schedule.
// short citations (author, journal, year); each card names its source once, a repeat is left out
const SRC = {
  mood: 'Noetel et al., BMJ 2024 (218 trials)',
  anxiety: 'Singh et al., Br J Sports Med 2023',
  diabetes: 'Diabetes Prevention Program, NEJM 2002; Indian DPP, Diabetologia 2006',
  fine: 'WHO physical activity guidelines, 2020',
  breathing: 'Zaccaro et al., Front Hum Neurosci 2018',
}
const WHY = {
  walk: { mood: () => t('Walking and jogging lower low-mood symptoms in trials. Any amount helps.'), anxiety: () => t('Regular aerobic exercise lowers anxiety symptoms.'), diabetes: () => t('About 150 minutes of activity a week, with healthier eating, more than halved type 2 diabetes cases in a large trial.') },
  strength: { mood: () => t('Strength training lowers low-mood symptoms too.'), diabetes: () => t('Strength training helps your body use insulin.'), fine: () => t('Guidelines suggest strength training on two days a week.') },
  mobility: { mood: () => t('Yoga-style movement eases low mood and anxiety.'), anxiety: () => t('Yoga-style movement eases low mood and anxiety.'), severe: () => t('Gentle stretching, at your own pace.') },
}
WHY['keep-moving'] = WHY.walk
const sourceOf = (id, why) => id === 'breathing' ? SRC.breathing : why === 'severe' ? null : SRC[why] || null
const findRoutine = name => S().routines.find(r => r.name === name)

function tipCard(tip, why, minutes, done) {
  const go = fn => () => { done(); ui().afterClose(fn) }   // close the sheets first, then act
  const startRoutine = r => go(() => startFlow(r.id))
  const mobility = () => {
    const r = findRoutine(t('Mobility & Core'))
    return { label: t('Start'), onClick: r ? startRoutine(r) : go(() => startFlow(addPlanRoutines('home-mobility')[0].id)) }
  }
  const walk = { label: t('Start a walk'), onClick: go(() => startFlow(walkRoutine())) }
  switch (tip.id) {
    case 'walk': return { title: t('Brisk walk, 10 minutes, 3 times this week'), note: t('Last 7 days: {0} of 150 active minutes', minutes), why: WHY.walk[why]?.(), action: walk }
    case 'keep-moving': return { title: t('Keep moving'), note: t('{0} active minutes in the last 7 days. The guideline is 150 to 300.', minutes), why: WHY.walk[why]?.(), action: walk }
    case 'gentle-walk': return { title: t('A 10-minute walk outside'), why: t('Gentle movement can help, when you feel ready. Talking to someone comes first.'), action: walk }
    case 'strength': {
      const last = [...S().workouts].reverse().map(w => S().routines.find(r => r.id === w.routineId)).find(Boolean)
      const r = last || S().routines.find(x => x.ex?.length && x.name !== t('Mobility & Core'))
      return {
        title: t('Strength training twice a week'), why: WHY.strength[why]?.(),
        action: r ? { label: t('Start {0}', r.name), onClick: startRoutine(r) }
          : { label: t('Add to my plan'), onClick: go(() => { const rs = addPlanRoutines('home-bw-3'); toast(t('Loaded “{0}” ({1} routines)', t('Home Bodyweight Full Body (3‑day)'), rs.length)); nav('/plan') }) },
      }
    }
    case 'mobility': return { title: t('Mobility & Core, about 15 minutes'), why: WHY.mobility[why]?.(), action: mobility() }
    case 'rest': return { title: t('A rest day, then Mobility & Core'), why: t('Hard training every day can wear you down. Rest is part of training.'), action: mobility() }
    case 'breathing': return { title: t('Box breathing, about a minute'), why: t('Slow breathing can calm you in the moment.'), action: { label: t('Begin'), onClick: go(breathingSheet) } }
    case 'evening': return { title: t('An evening routine instead of a drink'), why: t('Wind down sounds and a short walk can take the place of a drink. Cutting down helps at any point.'), action: { label: t('Wind down'), onClick: go(windDownSheet) } }
    case 'keep': return { title: t('Your results look fine. Keep doing what you do.'), why: t('Guidelines suggest 150 to 300 active minutes a week.') }
    default: return null
  }
}

// hub: "Suggested for you" at the top of Self-checks; fresh: a result just saved, where the
// "useful?" question may be asked (once, from the second result on)
function Tips({ hub, fresh, only }) {
  const st = useStore(s => s.S)
  const [open, setOpen] = useState(false)
  const lang = getLang(), prefs = st.selfcheckPrefs || {}, hidden = prefs.hiddenTips || []
  const res = tipsFor({ selfchecks: st.selfchecks, workouts: st.workouts, today: todayISO() })
  const cards = res.tips.filter(x => !hidden.includes(x.id)).map(x => {
    const why = reasonsShown(x, lang)[0]
    return why && { tip: x, reason: why, ...tipCard(x, why, res.minutes, () => ui().closeAll()) }
  }).filter(c => c && c.title)
  const [ask] = useState(() => fresh && cards.length > 0 && !prefs.tipsAsked && (st.selfchecks || []).length >= 2)
  const [answered, setAnswered] = useState(false)
  useEffect(() => { if (ask) update(s => { s.selfcheckPrefs = { ...s.selfcheckPrefs, tipsAsked: true } }) }, [ask])
  if (!cards.length || (only && only !== (res.gentle ? 'gentle' : 'plain'))) return null
  const answer = v => { update(s => { s.selfcheckPrefs = { ...s.selfcheckPrefs, tipsUseful: v } }); setAnswered(true); toast(t('Thanks. Your answer stays on this phone.')) }
  const hide = id => update(s => { s.selfcheckPrefs = { ...s.selfcheckPrefs, hiddenTips: [...new Set([...(s.selfcheckPrefs.hiddenTips || []), id])] } })
  cards.forEach((c, i) => { c.src = sourceOf(c.tip.id, c.reason); if (i && c.src === cards[i - 1].src0) c.src = null; c.src0 = sourceOf(c.tip.id, c.reason) })
  const list = <>
    {cards.map(c => <div key={c.tip.id} className="card tip-card">
      <div className="tip-t">{c.title}</div>
      {c.note && <div className="small muted">{c.note}</div>}
      {c.why && <div className="small" style={{ marginTop: 4 }}>{c.why}</div>}
      {c.src && <div className="small dim" style={{ marginTop: 4 }}>{t('Source: {0}', c.src)}</div>}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        {c.action && <Button size="sm" variant="tinted" onClick={c.action.onClick}>{c.action.label}</Button>}
        <Button size="sm" variant="ghost" className="dim" onClick={() => hide(c.tip.id)}>{t('Hide this')}</Button>
      </div>
    </div>)}
    <div className="small dim" style={{ margin: '6px 0 10px' }}>{t('If you have heart trouble, chest pain, feel faint when active, or are pregnant, ask a doctor before starting harder exercise.')}</div>
    {ask && !answered && <div className="card" style={{ marginBottom: 10 }}>
      <div className="small" id="tips-useful">{t('Were these suggestions useful?')}</div>
      <div className="row" role="group" aria-labelledby="tips-useful" style={{ gap: 8, marginTop: 6 }}>
        <Button size="sm" variant="tinted" onClick={() => answer('yes')}>{t('Yes')}</Button>
        <Button size="sm" variant="tinted" onClick={() => answer('no')}>{t('Not really')}</Button>
      </div>
    </div>}
  </>
  return <div className="tips">
    <h4 className="sec" style={{ margin: '14px 0 8px' }}>{hub ? t('Suggested for you') : t('Things that can help')}</h4>
    {res.gentle
      ? <><button type="button" className="lab-more" onClick={() => setOpen(v => !v)} aria-expanded={open}>{t('When you feel ready')} <Icon name={open ? 'chevronUp' : 'chevronDown'} /></button>{open && list}</>
      : list}
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
    <Tips hub only="plain" />
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
    <Tips hub only="gentle" />
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
  const isLatest = lastOf(st.selfchecks, e.inst)?.id === e.id   // advice follows the latest results, so not on an old one
  // only shown when something was logged: a "0 sessions" line after a mood check would read as a nudge
  const since = I.everyDays > 0 && prev && sinceLast(st.workouts, prev.d, e.d)
  return <>
    {!noTitle && <h3>{nameOf(e.inst)}</h3>}
    <div className="small muted">{fmtDate(e.d, true)}</div>
    {harm && <SafetyCard region={region} announce={!onDelete} />}
    <div style={{ fontSize: 28, fontWeight: 600, margin: '8px 0', color: b.level === 'high' ? 'var(--orange)' : undefined }}>{scoreLine(e)}</div>
    {I.everyDays > 0 && prev && <div className="small muted" style={{ marginBottom: 6 }}>{e.inst === 'who5' ? t('Change since last time: {0} (higher is better)', diff) : t('Change since last time: {0} (lower is better)', diff)}</div>}
    {since?.n > 0 && <div className="small muted" style={{ marginBottom: 6 }}>{t('Since your last check · Sessions: {0} · Active minutes: {1}', since.n, since.minutes)}</div>}
    <div style={{ marginBottom: 10 }}>{resultText(e)}</div>
    {a1c && <div className="card small" style={{ marginBottom: 10 }}>{t('Your latest HbA1c in Labs: {0}% ({1}). A measured value tells you more than a risk score.', a1c.m.v, fmtDate(a1c.report.d))}</div>}
    {b.level === 'high' && I.mental && !harm && <Support region={region} />}
    {isLatest && <Tips fresh={noTitle} />}
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

// Home card: how many checks are due, never which ones or their scores (Home can be screenshotted
// and seen over a shoulder; the hub and My Stats name them)
export function SelfChecksHomeCard({ S }) {
  const due = dueChecks(S.selfchecks, todayISO())
  // no aria-label: TalkBack reads the title and which checks are due
  return <button type="button" className="card tappable wind-card" onClick={selfChecksSheet}>
    <span className="lrow-i" style={{ '--tint': 'var(--indigo)' }}><Icon name="clipboard" /></span>
    <span className="wind-m">
      <span className="wind-t">{t('Self-checks')}</span>
      <span className="muted small">{due.length ? t('Due') + ' · ' + t(due.length === 1 ? '1 questionnaire' : '{0} questionnaires', due.length) : t('Wellbeing, mood, anxiety, alcohol and diabetes risk questionnaires')}</span>
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
