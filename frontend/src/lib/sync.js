import { mergeCheckins } from './checkin.js'
// Two-way merge of this device's state with a newer server copy saved by another device.
// Records are unioned so neither side's workouts, meals or weigh-ins are lost; settings and the
// weekly plan come from this device, the one the user is acting on.
// Check-ins are the exception to the shortcut below: deletes are recorded (checkinPrefs.deleted,
// .cleared) and honoured from either device, so a deleted private note never comes back.
// shortcut: no common ancestor, so a record deleted on one device comes back if the other still
// has it — upgrade to a three-way merge (keep the last-synced copy) if that proves annoying.

const byId = (mine = [], theirs = []) => {
  const seen = new Set(mine.map(x => x?.id))
  return [...mine, ...theirs.filter(x => x?.id == null || !seen.has(x.id))]
}

export function mergeState(local, remote) {
  if (!remote) return local
  const out = { ...local }
  const lp = local.checkinPrefs || {}, rp = remote.checkinPrefs || {}
  out.checkins = mergeCheckins(local.checkins, remote.checkins, lp, rp)
  out.checkinPrefs = { ...lp, deleted: [...new Set([...(lp.deleted || []), ...(rp.deleted || [])])], cleared: Math.max(lp.cleared || 0, rp.cleared || 0) || null }
  out.workouts = byId(local.workouts, remote.workouts).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  out.routines = byId(local.routines, remote.routines)
  out.customEx = byId(local.customEx, remote.customEx)

  // one weigh-in per day: keep whichever was entered last
  const bw = new Map()
  for (const b of [...(remote.bodyweight || []), ...(local.bodyweight || [])]) {
    const prev = bw.get(b.d)
    if (!prev || (b.t || 0) >= (prev.t || 0)) bw.set(b.d, b)
  }
  out.bodyweight = [...bw.values()].sort((a, b) => (a.d < b.d ? -1 : 1))

  const ln = local.nutrition || {}, rn = remote.nutrition || {}
  const days = { ...(rn.days || {}) }
  for (const [iso, list] of Object.entries(ln.days || {})) days[iso] = byId(list, rn.days?.[iso])
  out.nutrition = { ...ln, profile: ln.profile || rn.profile || null, days, foods: byId(ln.foods, rn.foods) }

  const ll = local.labs || {}, rl = remote.labs || {}
  out.labs = {
    ...ll,
    units: ll.units ?? rl.units ?? null,
    reports: byId(Array.isArray(ll.reports) ? ll.reports : [], Array.isArray(rl.reports) ? rl.reports : [])
      .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  }
  return out
}
