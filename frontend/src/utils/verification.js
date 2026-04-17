/** Normalize backend verification payload (REST or WebSocket). */
export function verificationRecordPassed(v) {
  if (!v || typeof v !== 'object') return false
  if (v.passed === true || v.passed === 'true') return true
  if (v.status === 'passed') return true
  if (v.timed_out === true || v.timed_out === 'true') return false
  const code = Number(v.exit_code)
  if (Number.isFinite(code) && code === 0) return true
  return false
}

export function verificationRecordSkipped(v) {
  return v && typeof v === 'object' && v.status === 'skipped'
}
