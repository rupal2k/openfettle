// Android-only bridge for the native exercise-form SDK.
export async function isAndroid() {
  if (import.meta.env.VITE_MOBILE !== '1') return false
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.getPlatform() === 'android'
  } catch {
    return false
  }
}

export async function runExerciseForm() {
  if (!(await isAndroid())) return false
  try {
    const { registerPlugin } = await import('@capacitor/core')
    await registerPlugin('ExerciseForm').start()
    return true
  } catch {
    return false
  }
}
