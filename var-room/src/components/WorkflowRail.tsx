import {useQuery} from '@sanity/sdk-react'

type Instance = {
  _id: string
  currentStage: string
  completedAt?: string
  abortedAt?: string
  stages: {name: string}[]
}

// peoples-var v4 in the order a run walks it; upheld and overturned are the two ends.
const FLOW = ['varRoom', 'referendum', 'extraTime', 'shootout']
const ENDS = ['upheld', 'overturned']
// Plain words only (Henrik): the stage names stay in code.
const PLAIN: Record<string, string> = {
  varRoom: 'VAR room',
  referendum: 'Fans vote',
  extraTime: 'Extra time',
  shootout: 'Penalty',
  upheld: 'Upheld',
  overturned: 'Overturned',
}

// L4 (design.md): the live run as one thin rail of real stage names, read in real time from the private
// `workflows` dataset. It names stages; it doesn't explain them.
export function WorkflowRail() {
  const {data} = useQuery<Instance | null>({
    projectId: 't2sbu6uu',
    dataset: 'workflows',
    query: `*[_type == "sanity.workflow.instance" && tag == "dev"] | order(startedAt desc)[0]{
      _id, currentStage, completedAt, abortedAt, "stages": stages[]{name}
    }`,
  })
  const live = Boolean(data && !data.completedAt)
  // An aborted run (a wipe, or an operator pick) has nothing to show: the rail goes back to idle.
  const shown = data && !data.abortedAt ? data : undefined
  const visits = (name: string) => shown?.stages.filter((s) => s.name === name).length ?? 0
  // Breadcrumb states: where the run is (current), where it has been (done), where it may still go (ahead).
  const state = (name: string) =>
    shown?.currentStage === name ? (live ? 'current' : `reached ${name}`) : visits(name) ? 'done' : 'ahead'
  const crumb = (name: string) => (
    <span className={`crumb ${state(name)}`} aria-current={shown?.currentStage === name && live ? 'step' : undefined}>
      {PLAIN[name]}
      {visits(name) > 1 && <span className="crumb-count">×{visits(name)}</span>}
    </span>
  )

  return (
    <section className="rail" aria-label="Workflow">
      <p className="rail-name">The Sanity workflow</p>
      <ol className="crumbs">
        {FLOW.map((name, i) => (
          <li key={name} className="crumbs-item">
            {i > 0 && (
              <Chevron />
            )}
            {crumb(name)}
          </li>
        ))}
        <li className="crumbs-item">
          <Chevron />
          <span className="crumb-ends">
            {crumb(ENDS[0])}
            <span className="crumb-or">or</span>
            {crumb(ENDS[1])}
          </span>
        </li>
      </ol>
      <p className="rail-meta">{shown ? (live ? 'Match running' : 'Match finished') : 'No match running'}</p>
    </section>
  )
}

// Drawn, not a text glyph: a › sits on the text baseline and drops below the pills' centre line.
function Chevron() {
  return (
    <svg className="crumb-sep" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
