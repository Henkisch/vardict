import {useState} from 'react'

import {HAS_OPERATOR_KEY, wipeRunData} from '../api'

// A clean slate before recording or judging. Deletes only run data (votes, rounds) and clears final calls;
// incidents and every other piece of content stay. Inline confirm: the Dashboard iframe may block confirm().
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function FullWipe() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  async function wipe() {
    setBusy(true)
    const result = await wipeRunData().catch(() => ({status: 'unreachable'}))
    setBusy(false)
    setTyped('')
    setMessage(
      result.status === 'wiped' && 'deleted' in result
        ? `Wiped. ${plural(result.deleted ?? 0, 'vote or round', 'votes and rounds')} deleted, ${plural(result.cleared ?? 0, 'final call', 'final calls')} cleared${result.aborted ? `, ${plural(result.aborted, 'live run', 'live runs')} aborted` : ''}.`
        : `Refused: ${result.status}`,
    )
    if (result.status === 'wiped') setOpen(false)
  }

  return (
    <section className="wipe">
      {!open ? (
        <div className="wipe-row">
          <p className="small muted" aria-live="polite">
            {message ?? (HAS_OPERATOR_KEY ? 'Clean slate before a recording or judging.' : 'Needs SANITY_APP_OPERATOR_KEY.')}
          </p>
          <button type="button" className="ghost" onClick={() => setOpen(true)} disabled={!HAS_OPERATOR_KEY}>
            Full wipe…
          </button>
        </div>
      ) : (
        <div className="wipe-confirm">
          <p className="small">
            Deletes <strong>every vote and every round</strong>, aborts a live run and clears all final calls, so the
            democracy clock goes back to the real VAR delays. Incidents, matches, teams, laws and pundit lines stay.
            Can&apos;t be undone.
          </p>
          <div className="row">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type WIPE"
              aria-label="Type WIPE to confirm"
              className="mono"
            />
            <button type="button" className="danger" onClick={wipe} disabled={typed !== 'WIPE' || busy}>
              {busy ? 'Wiping…' : 'Wipe run data'}
            </button>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
