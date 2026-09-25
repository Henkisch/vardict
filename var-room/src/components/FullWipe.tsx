import {useState} from 'react'

import {HAS_OPERATOR_KEY, wipeRunData} from '../api'

// A clean slate before recording or judging. Deletes only run data (votes, rounds) and clears final calls;
// incidents and every other piece of content stay. Inline confirm: the Dashboard iframe may block confirm().
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
        ? `Wiped: ${result.deleted} votes and rounds deleted, ${result.cleared} final calls cleared, ${result.aborted} live runs aborted.`
        : `Refused: ${result.status}`,
    )
    if (result.status === 'wiped') setOpen(false)
  }

  return (
    <section className="panel wipe">
      {!open ? (
        <div className="row">
          <button type="button" className="ghost" onClick={() => setOpen(true)} disabled={!HAS_OPERATOR_KEY}>
            Full wipe…
          </button>
          <span className="small muted">
            {HAS_OPERATOR_KEY ? 'Clean slate before a recording or judging.' : 'Needs SANITY_APP_OPERATOR_KEY.'}
          </span>
          {message && <span className="small">{message}</span>}
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
