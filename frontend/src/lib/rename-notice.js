// One-time note after the 1.7.0 rename, for people who used the app as OPENFIT.
// New users never see it: the key is set on their first start, while they have no data.
export const SEEN_KEY = 'openfettle_rename_seen'

const hasData = (s) => !!s && (
  (s.workouts || []).length || (s.routines || []).length || (s.bodyweight || []).length ||
  Object.keys(s.nutrition?.days || {}).length || (s.labs?.reports || []).length
)

export function shouldShowRenameNotice(state, storage) {
  try {
    if (storage.getItem(SEEN_KEY)) return false
    storage.setItem(SEEN_KEY, '1')
  } catch {
    return false  // private mode: better silent than shown on every start
  }
  return !!hasData(state)
}
