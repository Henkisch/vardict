import {useQuery} from '@sanity/sdk-react'
import {useState} from 'react'

import {HAS_OPERATOR_KEY, wipeRunData} from '../api'

// A clean slate before recording or judging. Deletes only run data (votes, rounds) and clears final calls;
// incidents and every other piece of content stay. Inline confirm: the Dashboard iframe may block confirm().
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// What a wipe would clear, read live: run data in production, a running match in the private workflows dataset.
// Nothing there: the button is off (Henrik: "full wipe shouldn't be possible if there's nothing to wipe").
export function FullWipe() {
  const {data: running} = useQuery<number>({
    projectId: 't2sbu6uu',
    dataset: 'workflows',
    query: 'count(*[_type == "sanity.workflow.instance" && tag == "dev" && !defined(completedAt)])',
  })
  return <Wipe running={running ?? 0} />
}

type Counts = {runData: number; finalCalls: number}

function Wipe({running}: {running: number}) {
  const {data: counts} = useQuery<Counts>({
    query: '{"runData": count(*[_type in ["vote", "referendum"]]), "finalCalls": count(*[_type == "incident" && defined(finalCall)])}',
  })
  const nothing = !counts || (counts.runData === 0 && counts.finalCalls === 0 && running === 0)
  const summary = counts
    ? [
        counts.runData && plural(counts.runData, 'vote or round', 'votes and rounds'),
        counts.finalCalls && plural(counts.finalCalls, 'final call', 'final calls'),
        running && plural(running, 'running match', 'running matches'),
      ]
        .filter(Boolean)
        .join(', ')
    : ''
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
            {message ??
              (!HAS_OPERATOR_KEY
                ? 'Needs SANITY_APP_OPERATOR_KEY.'
                : nothing
                  ? 'Nothing to wipe: a clean slate.'
                  : `A wipe would clear ${summary}.`)}
          </p>
          <button type="button" className="danger-outline" onClick={() => setOpen(true)} disabled={!HAS_OPERATOR_KEY || nothing}>
            Full wipe
          </button>
        </div>
      ) : (
        <div className="wipe-confirm" role="alertdialog" aria-labelledby="wipe-title" aria-describedby="wipe-body">
          <p id="wipe-title" className="wipe-title">
            <span aria-hidden>⚠</span> Wipe all run data?
          </p>
          <p id="wipe-body" className="small">
            Deletes <strong>every vote and every round</strong>, stops a match that&apos;s running and clears all final
            calls, so the democracy clock goes back to the real VAR delays. Incidents, matches, teams, laws and pundit
            lines stay. This can&apos;t be undone.
          </p>
          <div className="row">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type WIPE"
              aria-label="Type WIPE to confirm"
              className="mono"
              autoFocus
            />
            <button type="button" className="danger" onClick={wipe} disabled={typed !== 'WIPE' || busy}>
              {busy ? 'Wiping…' : 'Wipe everything'}
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
